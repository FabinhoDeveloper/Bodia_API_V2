import { Alimento } from "../data/alimentos";
import DietaQuantidadesPrompt, {
    RefeicaoSelecionada,
} from "../prompts/dieta-quantidades.prompt";
import DietaSelecaoPrompt from "../prompts/dieta-selecao.prompt";
import AiService from "../services/ai.service";
import { ResultadoCalculo } from "../types/perfil.types";
import { Refeicao, SelecaoDieta } from "../types/plano.types";

/**
 * As duas chamadas da dieta, em sequência:
 *
 *   1. SELEÇÃO   — quais alimentos entram em cada refeição (sem gramas);
 *   2. QUANTIDADES — quantas gramas de cada um dos escolhidos.
 *
 * A ordem importa e não pode ser paralelizada: a chamada 2 recebe como entrada
 * exatamente o que a 1 escolheu. É a divisão que reduz o espaço de busca de 284
 * alimentos para os 3 a 5 de cada refeição — o motivo de existir, registrado no
 * comentário de `iaTimeoutMs` em config/ia.ts.
 *
 * Por serem sequenciais, são estas duas que mandam no orçamento de tempo: o
 * treino corre em paralelo com a trilha inteira e se esconde atrás dela. É por
 * isso que o teto por chamada é metade do que o app aguenta esperar.
 *
 * Cada etapa é validada antes de alimentar a seguinte: um erro na seleção vira
 * uma exceção clara aqui, em vez de virar gramas absurdas duas chamadas adiante.
 */
export default class DietaIaGenerator {
    private readonly selecaoPrompt;
    private readonly quantidadesPrompt;
    private readonly aiService;

    constructor(
        selecaoPrompt: DietaSelecaoPrompt,
        quantidadesPrompt: DietaQuantidadesPrompt,
        aiService: AiService,
    ) {
        this.selecaoPrompt = selecaoPrompt;
        this.quantidadesPrompt = quantidadesPrompt;
        this.aiService = aiService;
    }

    async gerar(
        resultado: ResultadoCalculo,
        alimentos: Alimento[],
        restricoesAlimentares: string[],
    ): Promise<Refeicao[]> {
        const selecionadas = await this.selecionar(resultado, alimentos, restricoesAlimentares);

        return this.quantificar(resultado, selecionadas);
    }

    /** CHAMADA 1 — devolve as refeições com os objetos Alimento já resolvidos. */
    private async selecionar(
        resultado: ResultadoCalculo,
        alimentos: Alimento[],
        restricoesAlimentares: string[],
    ): Promise<RefeicaoSelecionada[]> {
        const { system, user } = this.selecaoPrompt.montar({
            resultado,
            alimentos,
            restricoesAlimentares,
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

            // Ids repetidos viram o mesmo alimento duas vezes na refeição, e a
            // chamada 2 teria de dosar os dois — dedup aqui é mais simples.
            const unicos = [...new Map(escolhidos.map((a) => [a.id, a])).values()];

            return { nome, alimentos: unicos };
        });
    }

    /** CHAMADA 2 — devolve as refeições já com gramas. */
    private async quantificar(
        resultado: ResultadoCalculo,
        refeicoes: RefeicaoSelecionada[],
    ): Promise<Refeicao[]> {
        const { system, user } = this.quantidadesPrompt.montar({ resultado, refeicoes });

        const resposta = await this.aiService.gerarJson(system, user, "dieta:quantidades");
        const dieta = this.parsearQuantidades(resposta);

        return refeicoes.map((selecionada) => {
            const comGramas = dieta.refeicoes.find((r) => r.nome === selecionada.nome);

            if (!comGramas?.itens?.length) {
                throw new Error(
                    `A IA não definiu as quantidades da refeição "${selecionada.nome}"`,
                );
            }

            // Conferência mais apertada que a do catálogo inteiro: nesta etapa o
            // universo válido é o que a PRÓPRIA IA escolheu na chamada 1.
            const permitidos = new Map(selecionada.alimentos.map((a) => [a.id, a]));

            const itens = comGramas.itens.map((item) => {
                const alimento = permitidos.get(item.alimentoId);

                if (!alimento) {
                    throw new Error(
                        `A IA quantificou um alimento que não estava na seleção da refeição "${selecionada.nome}" (id ${item.alimentoId})`,
                    );
                }

                if (!Number.isFinite(item.gramas) || item.gramas <= 0) {
                    throw new Error(
                        `A IA devolveu uma quantidade inválida para "${alimento.nome}" (${item.gramas} g)`,
                    );
                }

                // O nome vem do catálogo, não do que a IA escreveu: assim o app
                // nunca exibe um nome que não corresponde ao id gravado.
                return { alimentoId: alimento.id, nome: alimento.nome, gramas: item.gramas };
            });

            return { nome: selecionada.nome, itens };
        });
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

    private parsearQuantidades(resposta: string): { refeicoes: Refeicao[] } {
        let dieta: { refeicoes: Refeicao[] };

        try {
            dieta = JSON.parse(resposta) as { refeicoes: Refeicao[] };
        } catch {
            throw new Error("A IA retornou um JSON inválido nas quantidades");
        }

        if (!dieta.refeicoes?.length) {
            throw new Error("A IA retornou as quantidades sem refeições");
        }

        return dieta;
    }
}
