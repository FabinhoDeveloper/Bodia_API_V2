import { Alimento } from "../data/alimentos";
import { ResultadoCalculo } from "../types/perfil.types";
import { descreverPadrao } from "./padrao-refeicoes";
import { PromptMontado } from "./prompt.types";

export interface ContextoSelecao {
    resultado: ResultadoCalculo;
    alimentos: Alimento[];
    restricoesAlimentares: string[];
}

/**
 * O pedido de UMA refeição, quando a que veio na seleção não passou na
 * conferência do `DietaIaGenerator`.
 *
 * `motivo` e `instrucao` são produzidos lá, por quem conferiu: aqui só se
 * escreve o texto. É a mesma divisão que existe entre `AjusteSelecao` e o campo
 * `ajuste` acima — o prompt monta, quem sabe o que precisa ser dito é quem mediu.
 */
export interface ContextoReparo {
    resultado: ResultadoCalculo;
    alimentos: Alimento[];
    restricoesAlimentares: string[];
    /** O nome exato da refeição a refazer. */
    refeicao: string;
    /** O que estava errado, em português. */
    motivo: string;
    /** O que fazer, em linguagem de comida. */
    instrucao: string;
}

/**
 * O pedido de AJUSTE de uma refeição: ela está montável, mas os macros fecharam
 * fora da tolerância mesmo com as melhores porções.
 *
 * Difere do reparo no que o modelo recebe: aqui vai a seleção ANTERIOR. Sem ela,
 * "troque um dos carboidratos" e "além do que já escolheu" não se referem a
 * nada — a chamada não tem memória, e o modelo sortearia um prato novo em vez de
 * corrigir o que errou. Era exatamente o que o retry do dia inteiro fazia.
 */
export interface ContextoReajuste {
    resultado: ResultadoCalculo;
    alimentos: Alimento[];
    restricoesAlimentares: string[];
    /** O nome exato da refeição a ajustar. */
    refeicao: string;
    /** Os alimentos que ela tem hoje, na ordem em que foram escolhidos. */
    anteriores: Alimento[];
    /** O que mudar, em linguagem de comida (`AjusteSelecao`). */
    instrucao: string;
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

    /**
     * O pedido de UMA refeição, quando a que veio não passou na conferência.
     *
     * Refaz só a refeição culpada, e não o dia: as outras já estavam boas, e
     * outra rodada completa gastaria uma resposta grande para arriscar
     * estragá-las. O envelope de resposta é o MESMO da seleção completa, com uma
     * entrada só — assim o gerador reaproveita o parser que já tem, em vez de
     * manter um segundo formato que pode divergir dele.
     *
     * O catálogo inteiro vai junto de novo: é ele que garante que o modelo só
     * escolha ids permitidos, e é a mesma lista que ele já viu — nenhum alimento
     * novo aparece por ser um reparo.
     */
    montarReparo(contexto: ContextoReparo): PromptMontado {
        return {
            system: this.montarSystemReparo(contexto),
            user: this.montarUserReparo(contexto),
        };
    }

    /**
     * O ajuste de UMA refeição cujos macros não fecharam.
     *
     * Mesmo envelope de resposta da seleção completa, pela mesma razão do
     * reparo: um parser só. O catálogo inteiro vai junto — é ele que limita os
     * ids que o modelo pode citar.
     */
    montarReajuste(contexto: ContextoReajuste): PromptMontado {
        return {
            system: this.montarSystemReajuste(contexto),
            user: this.montarUserReajuste(contexto),
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

${this.listarCatalogo(alimentos)}

Escolha os alimentos de cada refeição em json.`;
    }

    private montarSystemReparo(contexto: ContextoReparo): string {
        return `Você monta o cardápio de um aplicativo brasileiro de nutrição, o BodIA.

## Sua única tarefa

REFAZER UMA refeição — "${contexto.refeicao}" — que você já montou e que foi recusada. Nada além dela.

REGRAS INVIOLÁVEIS:
1. NÃO informe quantidade, gramas, calorias ou qualquer número nutricional. Outra etapa calcula as porções.
2. Escolha SOMENTE alimentos da lista fornecida, pelo id exato. Nunca invente um item nem cite um id que não esteja na lista.
3. Devolva SÓ a refeição "${contexto.refeicao}". Não monte as outras refeições do dia.
4. Use de 3 a 5 alimentos (2 a 4 se for lanche ou ceia).
5. Se for refeição principal (almoço, jantar), ela precisa de UMA BASE DE CARBOIDRATO, UMA FONTE DE PROTEÍNA e UMA FONTE DE GORDURA. Foi a falta de uma dessas que reprovou a tentativa anterior.

## Como é esta refeição no Brasil

${descreverPadrao([contexto.refeicao])}

Prefira alimentos comuns e baratos, do dia a dia.

## Formato da resposta

Responda SOMENTE com um objeto json válido, sem texto antes ou depois e sem blocos de código markdown, exatamente nesta estrutura, com UMA refeição só:

{
  "refeicoes": [
    { "nome": "${contexto.refeicao}", "alimentoIds": [3, 60, 407, 84] }
  ]
}`;
    }

    private montarUserReparo(contexto: ContextoReparo): string {
        const { resultado, alimentos, restricoesAlimentares, refeicao } = contexto;
        const meta = resultado.dieta.refeicoes.find((r) => r.nome === refeicao);

        return `# Usuário

Objetivo: ${this.descreverObjetivo(resultado.meta.objetivo)}
Restrições alimentares declaradas: ${restricoesAlimentares.length > 0 ? restricoesAlimentares.join(", ") : "nenhuma"}

# Refeição a refazer

${refeicao}${meta ? `: refeição de aproximadamente ${meta.kcal} kcal` : ""}

O tamanho indica o peso dela no dia: escolha alimentos à altura. NÃO calcule porções.

# Alimentos disponíveis

Formato: id|nome|kcal|proteína|carboidrato|gordura — todos por 100 g.
Os números servem para você julgar se o alimento cabe na refeição; não são para calcular nada.

${this.listarCatalogo(alimentos)}

# Por que a tentativa anterior foi recusada

A refeição que você montou ficou ${contexto.motivo}, e por isso é impossível
encaixá-la na meta dela.

${contexto.instrucao}

Monte "${refeicao}" de novo em json.`;
    }

    private montarSystemReajuste(contexto: ContextoReajuste): string {
        return `Você monta o cardápio de um aplicativo brasileiro de nutrição, o BodIA.

## Sua única tarefa

AJUSTAR UMA refeição — "${contexto.refeicao}" — que você já montou. Ela é plausível, mas mesmo com as melhores porções não fecha a meta nutricional dela. Nada além dela.

REGRAS INVIOLÁVEIS:
1. NÃO informe quantidade, gramas, calorias ou qualquer número nutricional. Outra etapa calcula as porções.
2. Escolha SOMENTE alimentos da lista fornecida, pelo id exato. Nunca invente um item nem cite um id que não esteja na lista.
3. Devolva SÓ a refeição "${contexto.refeicao}". Não monte as outras refeições do dia.
4. Mude o MÍNIMO: troque ou acrescente um alimento seguindo a instrução, e mantenha os outros. Não monte um prato novo do zero.
5. Use de 3 a 5 alimentos (2 a 4 se for lanche ou ceia).
6. Se for refeição principal (almoço, jantar), ela continua precisando de UMA BASE DE CARBOIDRATO, UMA FONTE DE PROTEÍNA e UMA FONTE DE GORDURA.

## Como é esta refeição no Brasil

${descreverPadrao([contexto.refeicao])}

Prefira alimentos comuns e baratos, do dia a dia.

## Formato da resposta

Responda SOMENTE com um objeto json válido, sem texto antes ou depois e sem blocos de código markdown, exatamente nesta estrutura, com UMA refeição só e a lista COMPLETA de alimentos dela (os mantidos e os novos):

{
  "refeicoes": [
    { "nome": "${contexto.refeicao}", "alimentoIds": [3, 60, 407, 84] }
  ]
}`;
    }

    /**
     * A seleção anterior e a instrução ficam no FIM, depois do catálogo: são o
     * que precisa pesar mais na resposta, e o catálogo é longo o bastante para
     * enterrar qualquer coisa colocada antes dele.
     */
    private montarUserReajuste(contexto: ContextoReajuste): string {
        const { resultado, alimentos, restricoesAlimentares, refeicao, anteriores } = contexto;
        const meta = resultado.dieta.refeicoes.find((r) => r.nome === refeicao);

        return `# Usuário

Objetivo: ${this.descreverObjetivo(resultado.meta.objetivo)}
Restrições alimentares declaradas: ${restricoesAlimentares.length > 0 ? restricoesAlimentares.join(", ") : "nenhuma"}

# Refeição a ajustar

${refeicao}${meta ? `: refeição de aproximadamente ${meta.kcal} kcal` : ""}

# Alimentos disponíveis

Formato: id|nome|kcal|proteína|carboidrato|gordura — todos por 100 g.
Os números servem para você julgar se o alimento cabe na refeição; não são para calcular nada.

${this.listarCatalogo(alimentos)}

# Como "${refeicao}" está hoje

${anteriores.map((a) => `${a.id}|${a.nome}`).join("\n")}

# O que mudar

${contexto.instrucao}

Devolva "${refeicao}" ajustada em json.`;
    }

    private listarCatalogo(alimentos: Alimento[]): string {
        return alimentos
            .map((a) => `${a.id}|${a.nome}|${a.kcal}|${a.proteina}|${a.carboidrato}|${a.gordura}`)
            .join("\n");
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
