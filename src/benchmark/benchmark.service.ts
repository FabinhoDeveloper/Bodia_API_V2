import { PerfilOnboardingInput } from "../types/perfil.types";
import { EtapaBenchmark } from "../types/benchmark.types";
import { PlanoGerado, Validacao } from "../types/plano.types";
import EngineService from "../services/engine.service";
import PlanoIaGenerator from "../generators/plano-ia.generator";

export interface RespostaBenchmark {
    success: boolean;
    modelo: string | null;
    tempo: {
        total_ms: number;
        preparacao_ms: number;
        llm_ms: number;
    };
    /**
     * Tempo de cada trilha (dieta = seleção + quantidades; treino). Elas correm
     * em paralelo, como em produção, então a soma delas é maior que
     * `tempo.total_ms` — é `total_ms` que diz se cabe no orçamento do app, e as
     * etapas que dizem qual trilha domina.
     */
    etapas: EtapaBenchmark[];
    resposta: {
        json_valido: boolean;
        validacao_ok: boolean | null;
        // Desvio por macro (meta vs. obtido) que embasa validacao_ok.
        validacao: Validacao | null;
        // O plano tal como a IA montou. Fica presente mesmo com validacao_ok
        // false — é justamente para inspecionar o que ela tentou fazer.
        plano: PlanoGerado | null;
    } | null;
    erro: { tipo: string; mensagem: string } | null;
}

// Perfil fixo e determinístico — não vem de parâmetro nenhum. Sem restrição
// alimentar/física para que o catálogo enviado ao prompt seja o maior
// possível (o mesmo tamanho de catálogo que o pior caso do app real usaria).
const PERFIL_FICTICIO: PerfilOnboardingInput = {
    sexo: "M",
    dataNascimento: "2001-03-10", // ~25 anos
    peso: 80,
    altura: 180,
    percentualGordura: 18,
    nivelAtividade: "moderado",
    nivelExperiencia: "intermediario",
    objetivo: "perder", // perda de gordura / recomposição
    diasPorSemana: 4,
    numeroRefeicoes: 4,
    restricoesAlimentares: [],
    restricoesFisicas: [],
};

/**
 * Orquestrador do benchmark de geração (GET /api/teste-geracao). Isolado do
 * fluxo real do app: usa EngineService e PlanoIaGenerator (os mesmos de
 * produção, injetados por construtor), mas com um perfil fictício fixo em vez
 * do payload de /api/onboarding, e chama PlanoIaGenerator.gerarComMetricas em
 * vez de gerar() — método que existe só para isto.
 *
 * CONTAGEM DE TOKENS não vem na resposta. Com três chamadas ao modelo não
 * existe mais um `usage` único, e bombear o de cada uma até aqui obrigaria os
 * geradores de produção a carregar métrica de um endpoint temporário. Os
 * tokens de cada etapa saem no console, nos logs `[ia:<etapa>]` — que é onde se
 * olha ao rodar o benchmark de qualquer forma.
 */
export default class BenchmarkService {
    private readonly engineService;
    private readonly planoIaGenerator;
    private readonly modeloConfigurado;

    constructor(
        engineService: EngineService,
        planoIaGenerator: PlanoIaGenerator,
        modeloConfigurado: string,
    ) {
        this.engineService = engineService;
        this.planoIaGenerator = planoIaGenerator;
        this.modeloConfigurado = modeloConfigurado;
    }

    async executar(): Promise<RespostaBenchmark> {
        const inicioTotal = performance.now();
        console.log("[benchmark] início");
        console.log(`[benchmark] modelo requisitado: ${this.modeloConfigurado}`);

        const inicioCalculo = performance.now();
        const resultado = this.engineService.calcular(PERFIL_FICTICIO);
        const calculoMs = performance.now() - inicioCalculo;

        const resultadoGeracao = await this.planoIaGenerator.gerarComMetricas(
            {
                restricoesAlimentares: PERFIL_FICTICIO.restricoesAlimentares,
                restricoesFisicas: PERFIL_FICTICIO.restricoesFisicas,
            },
            resultado,
        );

        const preparacaoMs = calculoMs + resultadoGeracao.prepMs;
        const totalMs = performance.now() - inicioTotal;

        for (const etapa of resultadoGeracao.etapas) {
            const estado = etapa.sucesso ? "ok" : "FALHOU";
            console.log(`[benchmark] etapa ${etapa.nome}: ${etapa.ms.toFixed(1)} ms (${estado})`);
        }
        console.log(`[benchmark] preparação: ${preparacaoMs.toFixed(1)} ms`);
        console.log(`[benchmark] json válido: ${resultadoGeracao.jsonValido}`);
        console.log(`[benchmark] validação ok: ${resultadoGeracao.validacaoOk}`);
        console.log(`[benchmark] tempo total: ${totalMs.toFixed(1)} ms`);

        if (resultadoGeracao.erro) {
            console.log(
                `[benchmark] erro: ${resultadoGeracao.erro.tipo} — ${resultadoGeracao.erro.mensagem}`,
            );
        }

        return {
            success: resultadoGeracao.sucesso,
            modelo: this.modeloConfigurado,
            tempo: {
                total_ms: this.arredondar(totalMs),
                preparacao_ms: this.arredondar(preparacaoMs),
                llm_ms: this.arredondar(resultadoGeracao.llmMs),
            },
            etapas: resultadoGeracao.etapas.map((etapa) => ({
                ...etapa,
                ms: this.arredondar(etapa.ms),
            })),
            resposta: resultadoGeracao.sucesso
                ? {
                      json_valido: resultadoGeracao.jsonValido,
                      validacao_ok: resultadoGeracao.validacaoOk,
                      validacao: resultadoGeracao.validacao,
                      plano: resultadoGeracao.plano,
                  }
                : null,
            erro: resultadoGeracao.erro,
        };
    }

    private arredondar(ms: number): number {
        return Math.round(ms * 10) / 10;
    }
}
