import { ResultadoBenchmarkGeracao } from "../types/benchmark.types";
import { PerfilParaPlano, ResultadoCalculo } from "../types/perfil.types";
import CatalogoFilter from "../prompts/catalogo.filter";
import { PlanoGerado, PlanoValidado, Refeicao, SessaoTreino } from "../types/plano.types";
import AjusteSelecao from "./ajuste-selecao";
import DietaIaGenerator from "./dieta-ia.generator";
import TreinoIaGenerator from "./treino-ia.generator";
import ValidadorMacros from "./validador-macros";
import ValidadorVolume from "./validador-volume";

/**
 * Orquestra a geração do plano pela IA (chamado pelo PlanService, depois que o
 * EngineService já produziu o ResultadoCalculo).
 *
 * São DUAS chamadas ao modelo, não uma:
 *
 *   dieta:seleção   (DietaIaGenerator — as gramas saem do PorcoesSolver, sem IA)
 *   treino          (TreinoIaGenerator, independente)
 *
 * As duas trilhas rodam em PARALELO, então o tempo é max(dieta, treino) e não a
 * soma.
 *
 * A divisão existe porque a chamada única pedia ao modelo escolher alimentos,
 * dosar gramas até fechar 4 macros e montar o treino ao mesmo tempo — e ele
 * gastava minutos raciocinando para entregar café da manhã com filé de merluza.
 * Cada chamada agora faz uma coisa só.
 *
 * Já foram TRÊS: dosar as porções era uma chamada em sequência depois da
 * seleção. Ela saiu porque o modelo errava a aritmética — um almoço com 400 g de
 * arroz, o dia 30% acima da própria meta calórica — e porque dosar sob restrição
 * é trabalho de motor, não de redator. Ver `porcoes.solver.ts`.
 *
 * A conferência final NÃO mudou: validadorMacros recalcula kcal e macros a
 * partir da TACO e mede o desvio contra a meta do EngineService. O número da IA
 * continua nunca sendo aceito na palavra dela — e as gramas nem são mais pedidas
 * a ela.
 */
export default class PlanoIaGenerator {
    /**
     * Uma tentativa mais duas. O teto existe porque nem todo desvio é culpa da
     * seleção: se a meta da refeição não couber em porções realistas, tentar de
     * novo só queima crédito e tempo. Duas voltas dão ao modelo a chance de
     * trocar um alimento; a terceira já seria teimosia.
     */
    private static readonly MAX_TENTATIVAS = 3;

    /**
     * O quanto uma sessão de treino fora do orçamento pesa na comparação entre
     * tentativas, em pontos percentuais equivalentes. Alto o bastante para uma
     * tentativa com o treino certo vencer uma com a dieta 10% melhor.
     */
    private static readonly PESO_SESSAO_FORA = 20;

    private readonly catalogoFilter;
    private readonly dietaGenerator;
    private readonly treinoGenerator;
    private readonly validadorMacros;
    private readonly validadorVolume;
    private readonly ajusteSelecao;

    constructor(
        catalogoFilter: CatalogoFilter,
        dietaGenerator: DietaIaGenerator,
        treinoGenerator: TreinoIaGenerator,
        validadorMacros: ValidadorMacros,
        validadorVolume: ValidadorVolume,
        ajusteSelecao: AjusteSelecao,
    ) {
        this.catalogoFilter = catalogoFilter;
        this.dietaGenerator = dietaGenerator;
        this.treinoGenerator = treinoGenerator;
        this.validadorMacros = validadorMacros;
        this.validadorVolume = validadorVolume;
        this.ajusteSelecao = ajusteSelecao;
    }

    /**
     * Gera o plano, e REGERA enquanto os validadores acusarem desvio.
     *
     * Até então o desvio era medido, reportado e ignorado: o plano ia para o
     * banco fora da tolerância. Agora o gerador vê que errou e pede de novo, com
     * o desvio realimentado no prompt — a evolução que estava nos próximos
     * passos do CLAUDE.md.
     *
     * O que é regerado é a SELEÇÃO, não as porções. Com o `PorcoesSolver`, as
     * gramas já são as melhores possíveis para os alimentos escolhidos: o que
     * sobrou de desvio é responsabilidade de QUAIS alimentos entraram, e é essa
     * a única alavanca que outra chamada pode mover.
     *
     * Só a trilha que falhou é refeita. Macros fora pedem outra dieta; volume
     * fora pede outro treino. Refazer as duas gastaria uma chamada à toa e
     * ainda arriscaria estragar a que já estava boa.
     *
     * Esgotadas as tentativas, devolve a MELHOR — nunca deixa o usuário sem
     * plano. O desvio residual segue na conferência, que é o que o RF22 pede.
     */
    async gerar(perfil: PerfilParaPlano, resultado: ResultadoCalculo): Promise<PlanoValidado> {
        const { alimentos, exercicios } = this.filtrarCatalogos(perfil, resultado);

        type Treino = { sessoes: SessaoTreino[]; observacoes?: string };

        let melhor: PlanoValidado | null = null;
        let tentativasFeitas = 0;
        let refeicoes: Refeicao[] | undefined;
        let treino: Treino | undefined;

        for (let tentativa = 1; tentativa <= PlanoIaGenerator.MAX_TENTATIVAS; tentativa++) {
            const inicio = performance.now();

            // A dieta é refeita quando ainda não existe ou quando os macros
            // falharam; o treino, quando ainda não existe ou o volume falhou.
            // Na primeira tentativa nenhum dos dois existe e as duas trilhas
            // rodam em Promise.all — elas não se conhecem.
            const ajuste = melhor
                ? this.ajusteSelecao.comoTexto(
                      this.ajusteSelecao.montar(melhor.plano, alimentos, resultado),
                  )
                : undefined;

            const pedidoDieta: Promise<Refeicao[]> =
                refeicoes === undefined
                    ? this.dietaGenerator.gerar(
                          resultado,
                          alimentos,
                          perfil.restricoesAlimentares,
                          ajuste,
                      )
                    : Promise.resolve(refeicoes);

            const pedidoTreino: Promise<Treino> =
                treino === undefined
                    ? this.treinoGenerator.gerar(resultado, exercicios, perfil.restricoesFisicas)
                    : Promise.resolve(treino);

            [refeicoes, treino] = await Promise.all([pedidoDieta, pedidoTreino]);

            const plano: PlanoGerado = {
                dieta: { refeicoes },
                treino: { sessoes: treino.sessoes },
                observacoes: treino.observacoes,
            };

            // Os ids já foram conferidos dentro de cada gerador, contra um
            // universo mais estreito do que o catálogo (a seleção da chamada 1,
            // no caso da dieta). O que falta é a aritmética.
            const validacao = this.validadorMacros.validar(plano, alimentos, resultado);
            const validacaoVolume = this.validadorVolume.validar(plano, exercicios, resultado);
            const candidato: PlanoValidado = { plano, validacao, validacaoVolume };
            tentativasFeitas = tentativa;

            console.log(
                `[geração] tentativa ${tentativa}/${PlanoIaGenerator.MAX_TENTATIVAS}: ` +
                    `macros ${validacao.dentroDoLimite ? "ok" : "fora"}, ` +
                    `volume ${validacaoVolume.dentroDoLimite ? "ok" : "fora"}, ` +
                    `${Math.round(performance.now() - inicio)} ms`,
            );

            if (!melhor || this.desvioTotal(candidato) < this.desvioTotal(melhor)) {
                melhor = candidato;
            }

            if (validacao.dentroDoLimite && validacaoVolume.dentroDoLimite) break;

            // Descarta só a trilha culpada, para a próxima volta refazê-la.
            if (!validacao.dentroDoLimite) refeicoes = undefined;
            if (!validacaoVolume.dentroDoLimite) treino = undefined;
        }

        // O laço roda pelo menos uma vez, então `melhor` está preenchido — o
        // não-nulo é para o compilador, que não sabe disso.
        //
        // `tentativas` é quantas foram FEITAS, e não a que venceu: o que este
        // número mede é o custo em chamadas e em tempo, que é o que decide o
        // RNF02. A melhor tentativa pode muito bem ter sido a primeira.
        return { ...melhor!, tentativas: tentativasFeitas };
    }

    /**
     * O quanto uma tentativa erra, somado.
     *
     * Soma dos desvios ABSOLUTOS dos quatro macros mais uma penalidade por
     * sessão de treino fora do orçamento. Serve só para comparar tentativas
     * entre si — quem decide o que é aceitável continua sendo
     * `DESVIO_ACEITAVEL_PERCENTUAL`, no validador.
     */
    private desvioTotal(candidato: PlanoValidado): number {
        const { calorias, proteina, carboidrato, gordura } = candidato.validacao;
        const macros =
            Math.abs(calorias.desvioPercentual) +
            Math.abs(proteina.desvioPercentual) +
            Math.abs(carboidrato.desvioPercentual) +
            Math.abs(gordura.desvioPercentual);

        const sessoesFora = candidato.validacaoVolume.sessoes.filter(
            (sessao) => !sessao.dentroDoLimite,
        ).length;

        return macros + sessoesFora * PlanoIaGenerator.PESO_SESSAO_FORA;
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
