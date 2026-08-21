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
     * Aqui as trilhas rodam em SEQUÊNCIA de propósito, ao contrário de gerar():
     * em paralelo os tempos se sobrepõem e deixam de responder à pergunta que o
     * benchmark existe para responder, que é onde o tempo é gasto.
     */
    async gerarComMetricas(
        perfil: PerfilParaPlano,
        resultado: ResultadoCalculo,
    ): Promise<ResultadoBenchmarkGeracao> {
        const inicioPrep = performance.now();
        const { alimentos, exercicios } = this.filtrarCatalogos(perfil, resultado);
        const prepMs = performance.now() - inicioPrep;

        const etapas: ResultadoBenchmarkGeracao["etapas"] = [];
        const inicioTotal = performance.now();

        try {
            const inicioDieta = performance.now();
            const refeicoes = await this.dietaGenerator.gerar(
                resultado,
                alimentos,
                perfil.restricoesAlimentares,
            );
            etapas.push({ nome: "dieta", ms: performance.now() - inicioDieta, sucesso: true });

            const inicioTreino = performance.now();
            const treino = await this.treinoGenerator.gerar(
                resultado,
                exercicios,
                perfil.restricoesFisicas,
            );
            etapas.push({ nome: "treino", ms: performance.now() - inicioTreino, sucesso: true });

            const plano: PlanoGerado = {
                dieta: { refeicoes },
                treino: { sessoes: treino.sessoes },
                observacoes: treino.observacoes,
            };

            const validacao = this.validadorMacros.validar(plano, alimentos, resultado);

            return {
                sucesso: true,
                prepMs,
                llmMs: performance.now() - inicioTotal,
                etapas,
                jsonValido: true,
                validacaoOk: validacao.dentroDoLimite,
                validacao,
                plano,
                erro: null,
            };
        } catch (erro) {
            // Mesmo em erro, o tempo até a falha e as etapas que passaram são
            // justamente o dado que o benchmark quer capturar.
            const nomeDaEtapa = etapas.length === 0 ? "dieta" : "treino";
            etapas.push({ nome: nomeDaEtapa, ms: performance.now() - inicioTotal, sucesso: false });

            return {
                sucesso: false,
                prepMs,
                llmMs: performance.now() - inicioTotal,
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
