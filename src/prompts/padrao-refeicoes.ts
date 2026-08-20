/**
 * Como é, na prática, cada refeição do dia no Brasil.
 *
 * Existe porque o modelo, deixado à vontade, monta refeições nutricionalmente
 * corretas e culturalmente absurdas — filé de merluza no café da manhã fecha os
 * macros e ninguém come. O objetivo aqui não é nutrição (isso é do
 * EngineService), é plausibilidade.
 *
 * Isto é ORIENTAÇÃO NO PROMPT, não filtro de código. Difere de propósito do
 * catalogo.filter, que aplica restrição alimentar removendo o item do catálogo:
 * uma restrição violada machuca alguém, um café da manhã estranho só é
 * estranho. Se na prática o modelo continuar ignorando o padrão, o caminho é
 * classificar a TACO por refeição e passar a filtrar — o catalogo.filter é o
 * precedente pronto.
 *
 * As chaves precisam bater com os nomes gerados por DISTRIBUICAO_REFEICOES no
 * engine.service — são os mesmos nomes que chegam ao usuário e ao prompt.
 */
const PADRAO_POR_REFEICAO: Record<string, string> = {
    "Café da manhã":
        "pão (francês, de forma, integral), tapioca ou cuscuz; ovo; fruta; " +
        "café, leite ou iogurte; queijo branco, manteiga ou margarina. " +
        "NUNCA arroz, feijão, carne vermelha, peixe ou massa.",

    "Lanche da manhã":
        "fruta, iogurte, castanhas, biscoito simples ou vitamina. " +
        "Refeição pequena — 2 a 3 itens leves, nunca prato principal.",

    Almoço:
        "arroz e feijão como base; uma proteína (frango, carne, peixe ou ovo); " +
        "salada crua ou legume cozido; eventualmente farofa ou macarrão. " +
        "É a refeição mais completa do dia.",

    "Lanche da tarde":
        "pão ou tapioca com queijo, fruta, iogurte, castanhas, vitamina ou café. " +
        "Refeição pequena — nunca arroz com feijão e carne.",

    Jantar:
        "parecido com o almoço, porém mais leve: pode ser arroz com proteína e " +
        "legumes, sopa, ou pão com ovo. Aceita repetir o padrão do almoço.",

    Ceia:
        "muito leve: leite, iogurte, fruta, chá ou castanhas. " +
        "1 a 2 itens, nunca refeição completa.",
};

/**
 * O trecho do prompt que descreve o padrão das refeições que este usuário terá.
 * Só as refeições do plano dele entram — mandar as seis quando ele faz três só
 * gasta contexto e convida o modelo a inventar refeição que não existe.
 */
export function descreverPadrao(nomesDasRefeicoes: string[]): string {
    return nomesDasRefeicoes
        .map((nome) => {
            const padrao = PADRAO_POR_REFEICAO[nome];
            return padrao ? `- ${nome}: ${padrao}` : `- ${nome}: refeição equilibrada e usual.`;
        })
        .join("\n");
}
