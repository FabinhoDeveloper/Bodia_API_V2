import { ResultadoBenchmarkGeracao } from "../types/benchmark.types";
import { PerfilParaPlano, ResultadoCalculo } from "../types/perfil.types";
import CatalogoFilter from "../prompts/catalogo.filter";
import { PlanoGerado, PlanoValidado } from "../types/plano.types";
import DietaIaGenerator from "./dieta-ia.generator";
import TreinoIaGenerator from "./treino-ia.generator";
import ValidadorMacros from "./validador-macros";
import ValidadorVolume from "./validador-volume";

/**
 * Orquestra a geração do plano pela IA (chamado pelo PlanService, depois que o
 * EngineService já produziu o ResultadoCalculo).
 *
 * São TRÊS chamadas ao modelo, não uma:
 *
 *   dieta:seleção ──▶ dieta:quantidades     (DietaIaGenerator, em sequência)
 *   treino                                  (TreinoIaGenerator, independente)
 *
 * As duas trilhas rodam em PARALELO. Sem isso, dividir a geração sairia mais
 * lento que a chamada única que existia antes: o total seria a soma das três em
 * vez de max(dieta₁+dieta₂, treino).
 *
 * A divisão existe porque a chamada única pedia ao modelo escolher alimentos,
 * dosar gramas até fechar 4 macros e montar o treino ao mesmo tempo — e ele
 * gastava minutos raciocinando para entregar café da manhã com filé de merluza.
 * Cada chamada agora faz uma coisa só.
 *
 * A conferência final NÃO mudou: validadorMacros recalcula kcal e macros a
 * partir da TACO e mede o desvio contra a meta do EngineService. O número da IA
 * continua nunca sendo aceito na palavra dela.
 */
export default class PlanoIaGenerator {
    private readonly catalogoFilter;
    private readonly dietaGenerator;
    private readonly treinoGenerator;
    private readonly validadorMacros;
    private readonly validadorVolume;

    constructor(
        catalogoFilter: CatalogoFilter,
        dietaGenerator: DietaIaGenerator,
        treinoGenerator: TreinoIaGenerator,
        validadorMacros: ValidadorMacros,
        validadorVolume: ValidadorVolume,
    ) {
        this.catalogoFilter = catalogoFilter;
        this.dietaGenerator = dietaGenerator;
        this.treinoGenerator = treinoGenerator;
        this.validadorMacros = validadorMacros;
        this.validadorVolume = validadorVolume;
    }

    async gerar(perfil: PerfilParaPlano, resultado: ResultadoCalculo): Promise<PlanoValidado> {
        const { alimentos, exercicios } = this.filtrarCatalogos(perfil, resultado);

        // Promise.all e não await sequencial: dieta e treino não se conhecem.
        const [refeicoes, treino] = await Promise.all([
            this.dietaGenerator.gerar(resultado, alimentos, perfil.restricoesAlimentares),
            this.treinoGenerator.gerar(resultado, exercicios, perfil.restricoesFisicas),
        ]);

        const plano: PlanoGerado = {
            dieta: { refeicoes },
            treino: { sessoes: treino.sessoes },
            observacoes: treino.observacoes,
        };

        // Os ids já foram conferidos dentro de cada gerador, contra um universo
        // mais estreito do que o catálogo (a seleção da chamada 1, no caso da
        // dieta). O que falta é a aritmética.
        const validacao = this.validadorMacros.validar(plano, alimentos, resultado);
        const validacaoVolume = this.validadorVolume.validar(plano, exercicios, resultado);

        return { plano, validacao, validacaoVolume };
    }

    /**
     * Mesmo caminho de gerar(), mas medindo cada etapa — existe só para o
     * endpoint de benchmark (GET /api/teste-geracao).
     *
     * As trilhas rodam em PARALELO, exatamente como em gerar(). Serializá-las
     * daria um total que produção nunca vê (a soma, em vez de max(dieta,
     * treino)) — e é justamente esse total que decide se o modelo cabe nos 210s
     * de timeout do axios no app. O detalhamento por etapa não se perde com o
     * paralelismo porque cada CHAMADA registra o próprio tempo nos logs
     * `[ia:<etapa>]`, no sucesso e na falha.
     */
    async gerarComMetricas(
        perfil: PerfilParaPlano,
        resultado: ResultadoCalculo,
    ): Promise<ResultadoBenchmarkGeracao> {
        const inicioPrep = performance.now();
        const { alimentos, exercicios } = this.filtrarCatalogos(perfil, resultado);
        const prepMs = performance.now() - inicioPrep;

        const inicioTotal = performance.now();

        // allSettled, e não all: com `all`, a rejeição da dieta retornaria
        // enquanto a promise do treino continua viva — a etapa dele chegaria
        // depois da resposta montada, e uma falha dele viraria unhandled
        // rejection. Aqui as duas trilhas terminam sempre, e uma rodada que
        // falha ainda diz se o treino TAMBÉM falharia.
        const [dieta, treino] = await Promise.allSettled([
            this.medir("dieta", () =>
                this.dietaGenerator.gerar(resultado, alimentos, perfil.restricoesAlimentares),
            ),
            this.medir("treino", () =>
                this.treinoGenerator.gerar(resultado, exercicios, perfil.restricoesFisicas),
            ),
        ]);

        // Ordem fixa (dieta, treino), não ordem de término: em paralelo a
        // segunda pode acabar primeiro, e o relatório ficaria embaralhado entre
        // rodadas.
        const etapas = [this.etapaDe("dieta", dieta), this.etapaDe("treino", treino)];
        const llmMs = performance.now() - inicioTotal;

        if (dieta.status === "rejected" || treino.status === "rejected") {
            const erro = dieta.status === "rejected" ? dieta.reason : (treino as PromiseRejectedResult).reason;

            return {
                sucesso: false,
                prepMs,
                llmMs,
                etapas,
                jsonValido: false,
                validacaoOk: null,
                validacao: null,
                plano: null,
                erro: {
                    tipo: erro instanceof Error ? erro.constructor.name : "Erro",
                    mensagem: erro instanceof Error ? erro.message : String(erro),
                },
            };
        }

        const plano: PlanoGerado = {
            dieta: { refeicoes: dieta.value.valor },
            treino: { sessoes: treino.value.valor.sessoes },
            observacoes: treino.value.valor.observacoes,
        };

        const validacao = this.validadorMacros.validar(plano, alimentos, resultado);

        return {
            sucesso: true,
            prepMs,
            llmMs,
            etapas,
            jsonValido: true,
            validacaoOk: validacao.dentroDoLimite,
            validacao,
            plano,
            erro: null,
        };
    }

    /**
     * Cronometra uma trilha. Em caso de falha o tempo até o erro é preservado no
     * próprio rejeição — é o dado que o benchmark mais quer quando uma chamada
     * estoura o teto.
     */
    private async medir<T>(nome: string, trilha: () => Promise<T>): Promise<{ ms: number; valor: T }> {
        const inicio = performance.now();

        try {
            // O await sai antes do objeto de propósito: dentro do literal, `ms`
            // seria avaliado ANTES da trilha rodar e daria sempre ~0.
            const valor = await trilha();

            return { ms: performance.now() - inicio, valor };
        } catch (erro) {
            throw Object.assign(erro instanceof Error ? erro : new Error(String(erro)), {
                msAteFalhar: performance.now() - inicio,
                trilha: nome,
            });
        }
    }

    private etapaDe(
        nome: string,
        resultado: PromiseSettledResult<{ ms: number; valor: unknown }>,
    ): ResultadoBenchmarkGeracao["etapas"][number] {
        if (resultado.status === "fulfilled") {
            return { nome, ms: resultado.value.ms, sucesso: true };
        }

        const ms = (resultado.reason as { msAteFalhar?: number })?.msAteFalhar ?? 0;

        return { nome, ms, sucesso: false };
    }

    private filtrarCatalogos(perfil: PerfilParaPlano, resultado: ResultadoCalculo) {
        return {
            alimentos: this.catalogoFilter.filtrarAlimentos(perfil.restricoesAlimentares),
            exercicios: this.catalogoFilter.filtrarExercicios(
                perfil.restricoesFisicas,
                resultado.treino.sessoes.map((sessao) => sessao.nome),
            ),
        };
    }
}
