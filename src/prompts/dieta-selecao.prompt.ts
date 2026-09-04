import { Alimento } from "../data/alimentos";
import { ResultadoCalculo } from "../types/perfil.types";
import { descreverPadrao } from "./padrao-refeicoes";
import { PromptMontado } from "./prompt.types";

export interface ContextoSelecao {
    resultado: ResultadoCalculo;
    alimentos: Alimento[];
    restricoesAlimentares: string[];
    /**
     * O que deu errado na tentativa anterior, uma linha por refeição, já em
     * linguagem de escolha de alimento. Vazio ou ausente na primeira tentativa.
     *
     * Vai no fim do prompt do USUÁRIO, e não no system: é informação daquela
     * geração específica, e o system descreve a tarefa, que não mudou.
     */
    ajuste?: string[];
}

/**
 * CHAMADA 1 da dieta: escolher QUAIS alimentos compõem cada refeição.
 *
 * Esta chamada não calcula nada — nem gramas, nem calorias. A separação existe
 * porque, numa chamada só, a aritmética de encaixar 4 macros disputava atenção
 * com a escolha dos alimentos, e as duas saíam ruins: o modelo gastava minutos
 * raciocinando e ainda montava café da manhã com filé de merluza.
 *
 * Aqui ele faz uma coisa só, e é a coisa em que modelo de linguagem é bom:
 * escolher itens plausíveis para uma refeição brasileira.
 *
 * O valor nutricional VAI no catálogo mesmo sem haver conta a fazer — sem ele o
 * modelo escolheria só pelo nome e montaria refeições impossíveis de encaixar
 * na meta depois (seis folhas de alface para 700 kcal). Ele orienta a escolha,
 * não é insumo de cálculo.
 */
export default class DietaSelecaoPrompt {
    montar(contexto: ContextoSelecao): PromptMontado {
        return {
            system: this.montarSystem(contexto),
            user: this.montarUser(contexto),
        };
    }

    private montarSystem(contexto: ContextoSelecao): string {
        const nomes = contexto.resultado.dieta.refeicoes.map((r) => r.nome);

        return `Você monta o cardápio de um aplicativo brasileiro de nutrição, o BodIA.

## Sua única tarefa

ESCOLHER quais alimentos entram em cada refeição. Nada além disso.

REGRAS INVIOLÁVEIS:
1. NÃO informe quantidade, gramas, calorias ou qualquer número nutricional. Outra etapa calcula as porções — se você tentar calcular, atrapalha.
2. Escolha SOMENTE alimentos da lista fornecida, pelo id exato. Nunca invente um item nem cite um id que não esteja na lista.
3. Monte EXATAMENTE as refeições pedidas, na mesma ordem e com o nome exato. Não crie, não junte e não remova refeição.
4. Use de 3 a 5 alimentos por refeição (2 a 4 em lanches e ceia).
5. Toda refeição principal (almoço, jantar) precisa de UMA FONTE DE GORDURA — azeite, óleo, castanhas, queijo, manteiga ou abacate. Ela quase não aparece no prato e é o que fecha a caloria: sem ela, a porção de arroz e de pão teria de dobrar para chegar à mesma energia.

## O que faz um cardápio ser plausível

A lista já está nutricionalmente correta e livre das restrições do usuário — tudo nela é seguro. O que você precisa garantir é que a refeição faça SENTIDO para quem vai comê-la.

Uma refeição pode fechar os macros perfeitamente e ainda assim ser impossível: ninguém come peixe assado às 7h da manhã, nem feijão no lanche da tarde. Um cardápio que o usuário não vai seguir não serve para nada, por mais correto que esteja na planilha.

Como é cada refeição no Brasil:

${descreverPadrao(nomes)}

Prefira alimentos comuns e baratos, do dia a dia. Combine grupos dentro da refeição — uma fonte de carboidrato, uma de proteína, uma de gordura e algo de vegetal ou fruta — em vez de repetir o mesmo grupo.

## Formato da resposta

Responda SOMENTE com um objeto json válido, sem texto antes ou depois e sem blocos de código markdown, exatamente nesta estrutura:

{
  "refeicoes": [
    { "nome": "Café da manhã", "alimentoIds": [268, 489, 218, 122] },
    { "nome": "Almoço", "alimentoIds": [3, 60, 407, 84, 260] }
  ]
}`;
    }

    private montarUser(contexto: ContextoSelecao): string {
        const { resultado, alimentos, restricoesAlimentares } = contexto;
        const { meta, dieta } = resultado;

        return `# Usuário

Objetivo: ${this.descreverObjetivo(meta.objetivo)}
Restrições alimentares declaradas: ${restricoesAlimentares.length > 0 ? restricoesAlimentares.join(", ") : "nenhuma"}

# Refeições a montar (${dieta.numeroRefeicoes} no dia — use estes nomes)

O tamanho de cada refeição indica o peso dela no dia: escolha alimentos mais
substanciais nas maiores e mais leves nas menores. NÃO calcule porções.

${dieta.refeicoes.map((r) => `${r.nome}: refeição de aproximadamente ${r.kcal} kcal`).join("\n")}

# Alimentos disponíveis

Formato: id|nome|kcal|proteína|carboidrato|gordura — todos por 100 g.
Os números servem para você julgar se o alimento cabe na refeição; não são para calcular nada.

${alimentos.map((a) => `${a.id}|${a.nome}|${a.kcal}|${a.proteina}|${a.carboidrato}|${a.gordura}`).join("\n")}
${this.montarAjuste(contexto.ajuste)}
Escolha os alimentos de cada refeição em json.`;
    }

    /**
     * O retorno da tentativa anterior.
     *
     * Fica no FIM do prompt, logo antes do pedido, porque é a instrução mais
     * recente e a que precisa pesar mais na resposta — e porque o catálogo, que
     * vem antes, é longo o bastante para enterrar qualquer coisa colocada no
     * meio dele.
     */
    private montarAjuste(ajuste: string[] | undefined): string {
        if (!ajuste?.length) return "";

        return `
# Tentativa anterior

Você já montou este cardápio uma vez e ele não fechou as metas. As refeições
abaixo precisam de outra escolha de alimentos — mantenha as demais como estavam
em espírito, e continue respeitando todas as regras.

${ajuste.join("\n")}
`;
    }

    private descreverObjetivo(objetivo: string): string {
        const descricoes: Record<string, string> = {
            perder: "perder gordura (déficit calórico)",
            manter: "manter peso e composição corporal",
            ganhar: "ganhar massa muscular (superávit calórico)",
        };
        return descricoes[objetivo] ?? objetivo;
    }
}
