import { Alimento } from "../data/alimentos";
import { ResultadoBenchmarkGeracao } from "../types/benchmark.types";
import { PerfilParaPlano, ResultadoCalculo } from "../types/perfil.types";
import CatalogoFilter from "../prompts/catalogo.filter";
import {
    PlanoGerado,
    PlanoValidado,
    Refeicao,
    SessaoTreino,
    Validacao,
} from "../types/plano.types";
import AjusteSelecao from "./ajuste-selecao";
import DietaIaGenerator, { DietaGerada } from "./dieta-ia.generator";
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
     * Uma tentativa mais quatro. O teto existe porque nem todo desvio é culpa da
     * seleção: se a meta da refeição não couber em porções realistas, tentar de
     * novo só queima crédito e tempo.
     *
     * Já foram três (uma mais duas), e o plano ainda saía fora da tolerância
     * com frequência. As voltas a mais custam pouco porque só o que falhou é
     * refeito — em geral as refeições fora da meta, uma chamada curta cada. Não há
     * teto de TEMPO no laço: um modelo que estoura o timeout em toda volta
     * passa dos 210 s do app, risco que já existia com três e foi aceito.
     */
    private static readonly MAX_TENTATIVAS = 5;

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
     * Só a trilha que falhou é refeita. Volume fora pede outro treino. Macros
     * fora NÃO pedem outra dieta: pedem de novo só as refeições fora da meta,
     * cada uma com o prato anterior junto, e cada refeição fica com a melhor
     * versão que já teve (`reajustarDieta`). Pedir o dia inteiro, numa chamada
     * sem memória, era sortear um cardápio novo a cada volta — e estragar as
     * refeições que já estavam boas.
     *
     * Esgotadas as tentativas, devolve a MELHOR — nunca deixa o usuário sem
     * plano. O desvio residual segue na conferência, que é o que o RF22 pede.
     */
    async gerar(perfil: PerfilParaPlano, resultado: ResultadoCalculo): Promise<PlanoValidado> {
        const { alimentos, exercicios } = this.filtrarCatalogos(perfil, resultado);

        type Treino = { sessoes: SessaoTreino[]; observacoes?: string };

        let melhor: PlanoValidado | null = null;
        let tentativasFeitas = 0;
        let dieta: DietaGerada | undefined;
        let treino: Treino | undefined;
        // A dieta atual existe, mas a última conferência reprovou os macros.
        let reajustar = false;
        let ultimoErro: unknown;

        for (let tentativa = 1; tentativa <= PlanoIaGenerator.MAX_TENTATIVAS; tentativa++) {
            const inicio = performance.now();

            // A dieta é gerada quando ainda não existe e reajustada quando os
            // macros falharam; o treino é refeito quando ainda não existe ou o
            // volume falhou. Na primeira tentativa nenhum dos dois existe e as
            // duas trilhas rodam em Promise.all — elas não se conhecem.
            const pedidoDieta: Promise<DietaGerada> =
                dieta === undefined
                    ? this.dietaGenerator.gerar(resultado, alimentos, perfil.restricoesAlimentares)
                    : reajustar
                      ? this.reajustarDieta(dieta, perfil, alimentos, resultado)
                      : Promise.resolve(dieta);

            const pedidoTreino: Promise<Treino> =
                treino === undefined
                    ? this.treinoGenerator.gerar(resultado, exercicios, perfil.restricoesFisicas)
                    : Promise.resolve(treino);

            // allSettled, e não all, pela mesma razão de `gerarComMetricas`: com
            // `all`, a rejeição de uma trilha retorna enquanto a promise da
            // outra continua viva, e a falha dela vira unhandled rejection.
            //
            // E, principalmente: uma trilha que LANÇA agora gasta uma tentativa
            // em vez de matar a geração. É o que cobre JSON inválido, resposta
            // vazia e timeout do modelo — até então uma única falha transitória
            // derrubava a requisição inteira mesmo havendo quatro tentativas
            // sobrando no laço.
            const [respostaDieta, respostaTreino] = await Promise.allSettled([
                pedidoDieta,
                pedidoTreino,
            ]);

            if (respostaDieta.status === "fulfilled") {
                dieta = respostaDieta.value;
                // Já reajustada: se o treino lançou nesta volta, a próxima
                // confere esta dieta antes de mexer nela de novo.
                reajustar = false;
            }
            if (respostaTreino.status === "fulfilled") treino = respostaTreino.value;

            if (respostaDieta.status === "rejected" || respostaTreino.status === "rejected") {
                ultimoErro =
                    respostaDieta.status === "rejected"
                        ? respostaDieta.reason
                        : (respostaTreino as PromiseRejectedResult).reason;

                tentativasFeitas = tentativa;

                console.log(
                    `[geração] tentativa ${tentativa}/${PlanoIaGenerator.MAX_TENTATIVAS} falhou: ` +
                        `${ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)}`,
                );

                continue;
            }

            const plano: PlanoGerado = {
                dieta: { refeicoes: dieta!.refeicoes },
                treino: { sessoes: treino!.sessoes },
                observacoes: treino!.observacoes,
            };

            // Os ids já foram conferidos dentro de cada gerador, contra um
            // universo mais estreito do que o catálogo (a seleção da chamada 1,
            // no caso da dieta). O que falta é a aritmética.
            const validacao = this.validadorMacros.validar(plano, alimentos, resultado);
            const validacaoVolume = this.validadorVolume.validar(plano, exercicios, resultado);
            const candidato: PlanoValidado = {
                plano,
                validacao,
                validacaoVolume,
                avisos: dieta!.avisos,
            };
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

            // Só a trilha culpada é mexida na próxima volta.
            reajustar = !validacao.dentroDoLimite;
            if (!validacaoVolume.dentroDoLimite) treino = undefined;
        }

        // Só chega aqui sem candidato nenhum se TODAS as tentativas lançaram —
        // a IA fora do ar, credencial inválida, timeout em todas. Aí não há
        // plano a entregar e o erro segue subindo até virar 500, como deve.
        if (!melhor) {
            throw ultimoErro instanceof Error
                ? ultimoErro
                : new Error(`Não foi possível gerar o plano: ${String(ultimoErro)}`);
        }

        // `tentativas` é quantas foram FEITAS, e não a que venceu: o que este
        // número mede é o custo em chamadas e em tempo, que é o que decide o
        // RNF02. A melhor tentativa pode muito bem ter sido a primeira.
        return { ...melhor, tentativas: tentativasFeitas };
    }

    /**
     * Pede de novo as refeições fora da meta e fica, refeição a refeição, com a
     * melhor versão entre a atual e a nova.
     *
     * Escolher por refeição, e não pelo dia, é possível porque cada refeição
     * tem a própria meta e o dia é a soma delas: um almoço melhor não piora o
     * jantar. O `melhor` do laço continua sendo decidido pelo dia inteiro, então
     * esta troca nunca faz o plano entregue regredir.
     *
     * Sem refeição nenhuma a apontar — o dia fora com todas elas dentro, por
     * arredondamento das metas — não há o que pedir de forma estreita, e a
     * seleção do dia é pedida de novo.
     */
    private async reajustarDieta(
        dieta: DietaGerada,
        perfil: PerfilParaPlano,
        alimentos: Alimento[],
        resultado: ResultadoCalculo,
    ): Promise<DietaGerada> {
        const correcoes = this.ajusteSelecao.montar(dieta.refeicoes, alimentos, resultado);

        if (!correcoes.length) {
            return this.dietaGenerator.gerar(resultado, alimentos, perfil.restricoesAlimentares);
        }

        const novas = await this.dietaGenerator.reajustar(
            resultado,
            alimentos,
            perfil.restricoesAlimentares,
            dieta.refeicoes,
            correcoes,
        );

        const metaPorNome = new Map(resultado.dieta.refeicoes.map((r) => [r.nome, r]));
        const novaPorNome = new Map(novas.map((r) => [r.nome, r]));
        const trocadas = new Set<string>();

        const refeicoes = dieta.refeicoes.map((atual) => {
            const nova = novaPorNome.get(atual.nome);
            const meta = metaPorNome.get(atual.nome);
            if (!nova || !meta) return atual;

            const desvioAtual = this.desvioRefeicao(atual, meta, alimentos);
            const desvioNovo = this.desvioRefeicao(nova, meta, alimentos);
            const trocou = desvioNovo < desvioAtual;

            console.log(
                `[dieta] reajuste de "${atual.nome}": desvio ${desvioAtual.toFixed(1)} → ` +
                    `${desvioNovo.toFixed(1)} (${trocou ? "trocada" : "mantida a anterior"})`,
            );

            if (!trocou) return atual;

            trocadas.add(atual.nome);
            return nova;
        });

        // O aviso de uma refeição (ex.: "Almoço: sem nenhuma fonte de proteína")
        // descreve a versão ANTIGA. A nova passou na conferência de cobertura do
        // reajuste, então o aviso dela deixa de valer.
        const avisos = dieta.avisos.filter(
            (aviso) => ![...trocadas].some((nome) => aviso.startsWith(`${nome}:`)),
        );

        return { refeicoes, avisos };
    }

    private desvioRefeicao(
        refeicao: Refeicao,
        meta: { kcal: number; proteina: number; carboidrato: number; gordura: number },
        alimentos: Alimento[],
    ): number {
        return this.somaDosDesvios(
            this.validadorMacros.validarRefeicao(refeicao.itens, alimentos, meta),
        );
    }

    /** Soma dos desvios ABSOLUTOS dos quatro macros, em pontos percentuais. */
    private somaDosDesvios({ calorias, proteina, carboidrato, gordura }: Validacao): number {
        return (
            Math.abs(calorias.desvioPercentual) +
            Math.abs(proteina.desvioPercentual) +
            Math.abs(carboidrato.desvioPercentual) +
            Math.abs(gordura.desvioPercentual)
        );
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
        const macros = this.somaDosDesvios(candidato.validacao);

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
            dieta: { refeicoes: dieta.value.valor.refeicoes },
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
                perfil.nivelExperiencia,
            ),
        };
    }
}
