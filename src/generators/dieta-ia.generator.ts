import { Alimento } from "../data/alimentos";
import { PAPEIS_PROTEICOS, papelDe } from "../data/porcoes";
import DietaSelecaoPrompt from "../prompts/dieta-selecao.prompt";
import AiService from "../services/ai.service";
import { ResultadoCalculo } from "../types/perfil.types";
import { Refeicao, SelecaoDieta } from "../types/plano.types";
import PorcoesSolver from "./porcoes.solver";

/** Uma refeição já com os alimentos escolhidos na chamada 1. */
interface RefeicaoSelecionada {
    nome: string;
    alimentos: Alimento[];
}

/**
 * As refeições em que a meta é grande demais para fechar sem uma base de
 * carboidrato e uma fonte de proteína. Lanche e ceia não entram: são pequenos e
 * uma fruta com iogurte já os resolve.
 *
 * Os nomes vêm de DISTRIBUICAO_REFEICOES, no engine.service.
 */
const REFEICOES_PRINCIPAIS = ["Almoço", "Jantar"];

/**
 * As duas etapas da dieta, em sequência:
 *
 *   1. SELEÇÃO   — quais alimentos entram em cada refeição (chamada à IA);
 *   2. PORÇÕES   — quantas gramas de cada um (determinístico, sem IA).
 *
 * A etapa 2 JÁ FOI uma chamada à IA, e foi por isso que um almoço saiu com 400 g
 * de arroz e um jantar com 500 g: o modelo recebia as quatro metas da refeição,
 * devolvia as gramas, e a única conferência era `gramas > 0`. Medido contra a
 * própria meta, o dia vinha 30% acima na caloria e 72% acima na proteína.
 * Dosar porções sob restrição é aritmética, não redação — o `PorcoesSolver`
 * resolve, dentro das faixas de `data/porcoes.ts`, e o resultado é o mesmo toda
 * vez.
 *
 * Sobra para o LLM o que ele faz bem: escolher itens plausíveis para uma
 * refeição brasileira. É a mesma divisão de trabalho que a fundamentação do
 * projeto defende entre o motor determinístico e o modelo — ela só não estava
 * sendo aplicada aqui.
 *
 * Cada etapa é validada antes de alimentar a seguinte: um erro na seleção vira
 * uma exceção clara aqui, em vez de virar gramas impossíveis lá na frente.
 */
export default class DietaIaGenerator {
    private readonly selecaoPrompt;
    private readonly aiService;
    private readonly porcoesSolver;

    constructor(
        selecaoPrompt: DietaSelecaoPrompt,
        aiService: AiService,
        porcoesSolver: PorcoesSolver,
    ) {
        this.selecaoPrompt = selecaoPrompt;
        this.aiService = aiService;
        this.porcoesSolver = porcoesSolver;
    }

    /**
     * `ajuste` é o retorno da tentativa anterior, quando houve uma: as refeições
     * que não fecharam e o que fazer com elas. Vazio na primeira.
     */
    async gerar(
        resultado: ResultadoCalculo,
        alimentos: Alimento[],
        restricoesAlimentares: string[],
        ajuste?: string[],
    ): Promise<Refeicao[]> {
        const selecionadas = await this.selecionar(
            resultado,
            alimentos,
            restricoesAlimentares,
            ajuste,
        );

        return this.quantificar(resultado, selecionadas);
    }

    /** CHAMADA 1 — devolve as refeições com os objetos Alimento já resolvidos. */
    private async selecionar(
        resultado: ResultadoCalculo,
        alimentos: Alimento[],
        restricoesAlimentares: string[],
        ajuste?: string[],
    ): Promise<RefeicaoSelecionada[]> {
        const { system, user } = this.selecaoPrompt.montar({
            resultado,
            alimentos,
            restricoesAlimentares,
            ajuste,
        });

        const resposta = await this.aiService.gerarJson(system, user, "dieta:seleção");
        const selecao = this.parsearSelecao(resposta);

        const porId = new Map(alimentos.map((a) => [a.id, a]));
        const nomesEsperados = resultado.dieta.refeicoes.map((r) => r.nome);

        return nomesEsperados.map((nome) => {
            const escolhida = selecao.refeicoes.find((r) => r.nome === nome);

            // Refeição faltando é falha de instrução, não de conteúdo: seguir
            // adiante produziria um plano com menos refeições do que o usuário
            // declarou fazer, e o erro só apareceria na tela.
            if (!escolhida?.alimentoIds?.length) {
                throw new Error(`A IA não escolheu alimentos para a refeição "${nome}"`);
            }

            const escolhidos = escolhida.alimentoIds.map((id) => {
                const alimento = porId.get(id);

                // O catálogo já passou pelo CatalogoFilter, então um id de fora
                // dele é alucinação E, potencialmente, um item proibido para
                // este usuário entrando pela porta dos fundos.
                if (!alimento) {
                    throw new Error(
                        `A IA escolheu um alimento fora do catálogo permitido (id ${id}, refeição "${nome}")`,
                    );
                }

                return alimento;
            });

            // Ids repetidos viram o mesmo alimento duas vezes na refeição, e o
            // solver teria de dosar os dois — dedup aqui é mais simples.
            const unicos = [...new Map(escolhidos.map((a) => [a.id, a])).values()];

            this.exigirCobertura(nome, unicos);

            return { nome, alimentos: unicos };
        });
    }

    /**
     * ETAPA 2 — as gramas, resolvidas pelo motor. Sem IA.
     *
     * Cada refeição é resolvida contra a SUA meta, e não contra a do dia: é a
     * repartição que `EngineService.calcularDieta` já produziu. Resolver o dia
     * inteiro de uma vez deixaria o solver livre para concentrar tudo numa
     * refeição só.
     *
     * O nome vem do catálogo, não do que a IA escreveu: assim o app nunca exibe
     * um nome que não corresponde ao id gravado.
     */
    private quantificar(
        resultado: ResultadoCalculo,
        refeicoes: RefeicaoSelecionada[],
    ): Refeicao[] {
        const metaPorNome = new Map(resultado.dieta.refeicoes.map((r) => [r.nome, r]));

        return refeicoes.map((selecionada) => {
            const meta = metaPorNome.get(selecionada.nome);

            // O nome saiu de resultado.dieta.refeicoes em `selecionar`, então a
            // meta existe. O guarda é contra a lista mudar de origem um dia.
            if (!meta) {
                throw new Error(`Sem meta calculada para a refeição "${selecionada.nome}"`);
            }

            const porId = new Map(selecionada.alimentos.map((a) => [a.id, a]));

            const itens = this.porcoesSolver
                .resolver(selecionada.alimentos, {
                    kcal: meta.kcal,
                    proteina: meta.proteina,
                    carboidrato: meta.carboidrato,
                    gordura: meta.gordura,
                })
                .map((porcao) => ({
                    alimentoId: porcao.alimentoId,
                    nome: porId.get(porcao.alimentoId)!.nome,
                    gramas: porcao.gramas,
                }));

            return { nome: selecionada.nome, itens };
        });
    }

    /**
     * Uma refeição principal precisa de base de carboidrato E de fonte de
     * proteína.
     *
     * Sem as duas a meta é inalcançável por construção, e o solver entregaria o
     * prato possível com um desvio enorme — um almoço de 1000 kcal montado só
     * com legumes. Falhar aqui é mais honesto: o problema é da SELEÇÃO, e é ela
     * que precisa ser refeita.
     *
     * Vale só para almoço e jantar. Num lanche a meta é pequena e fruta com
     * iogurte a resolve.
     */
    private exigirCobertura(nome: string, alimentos: Alimento[]): void {
        if (!REFEICOES_PRINCIPAIS.includes(nome)) return;

        const papeis = alimentos.map(papelDe);

        if (!papeis.includes("BASE_CARBO")) {
            throw new Error(`A IA montou "${nome}" sem nenhuma base de carboidrato`);
        }

        if (!papeis.some((papel) => PAPEIS_PROTEICOS.includes(papel))) {
            throw new Error(`A IA montou "${nome}" sem nenhuma fonte de proteína`);
        }
    }

    private parsearSelecao(resposta: string): SelecaoDieta {
        let selecao: SelecaoDieta;

        try {
            selecao = JSON.parse(resposta) as SelecaoDieta;
        } catch {
            throw new Error("A IA retornou um JSON inválido na seleção de alimentos");
        }

        if (!selecao.refeicoes?.length) {
            throw new Error("A IA retornou uma seleção sem refeições");
        }

        return selecao;
    }
}
