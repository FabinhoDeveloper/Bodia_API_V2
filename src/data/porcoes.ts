import { Alimento } from "./alimentos";

/**
 * Quanto de cada alimento cabe num prato, e que papel ele cumpre na refeição.
 *
 * Existe porque as gramas eram resposta do LLM e nada as conferia: o único
 * critério era `gramas > 0`. O resultado medido foi um almoço com 400 g de
 * arroz e um jantar com 500 g — 2,9 kg de comida no dia, 30% acima da própria
 * meta calórica. O prompt trazia um PISO ("uma porção de arroz é 100-200 g, não
 * 37 g") e nenhum teto.
 *
 * Tabela de política, como `volume-treino.ts` e `limites-seguranca.ts`: pura,
 * sem I/O, com a razão de cada número aqui dentro. É o que o
 * `porcoes.solver.ts` consulta para nunca sair da faixa do comível.
 *
 * ## Por que duas fontes diferentes
 *
 * PAPEL sai da CATEGORIA da TACO, que é confiável para dizer o que o alimento é.
 * FAIXA sai da DENSIDADE ENERGÉTICA, que é confiável para dizer quanto se come:
 * ninguém come 200 g de azeite nem 20 g de alface, e a diferença entre os dois
 * é justamente kcal por 100 g.
 *
 * Usar categoria para os dois não funcionaria — "Cereais e derivados" tem arroz
 * cozido (128 kcal, 150 g) e farinha de trigo (360 kcal, 25 g) lado a lado, e
 * "Leite e derivados" tem iogurte (51 kcal) e leite em pó (497 kcal). Usar
 * densidade para os dois também não: azeitona e azeite têm densidades
 * parecidas e papéis diferentes de mesa.
 */

export type Papel = "BASE_CARBO" | "PROTEINA" | "GORDURA" | "LATICINIO" | "VEGETAL" | "FRUTA";

/** Gramas: o mínimo que vale a pena servir, a porção usual e o teto do razoável. */
export interface FaixaPorcao {
    min: number;
    usual: number;
    max: number;
}

const PAPEL_POR_CATEGORIA: Record<string, Papel> = {
    "Cereais e derivados": "BASE_CARBO",
    "Leguminosas e derivados": "BASE_CARBO",
    "Carnes e derivados": "PROTEINA",
    "Pescados e frutos do mar": "PROTEINA",
    "Ovos e derivados": "PROTEINA",
    "Leite e derivados": "LATICINIO",
    "Gorduras e óleos": "GORDURA",
    "Nozes e sementes": "GORDURA",
    "Verduras, hortaliças e derivados": "VEGETAL",
    "Frutas e derivados": "FRUTA",
    // Azeitona, azeitona verde e leite de coco — os três da categoria são
    // gordura de mesa, apesar do nome genérico.
    "Outros alimentos industrializados": "GORDURA",
};

/**
 * Os alimentos que a categoria classifica mal.
 *
 * Amendoim e seus doces estão em "Leguminosas" ao lado do feijão, e soja em pó
 * também; pinhão e pupunha estão em "Nozes e sementes" mas são amiláceos. Sem
 * estes ajustes a conferência de cobertura aceitaria um almoço cuja "base de
 * carboidrato" é um punhado de amendoim.
 */
const PAPEL_POR_ALIMENTO: Record<number, Papel> = {
    557: "GORDURA", // Amendoim, grão, cru
    558: "GORDURA", // Amendoim, torrado, salgado
    579: "GORDURA", // Paçoca, amendoim
    580: "GORDURA", // Pé-de-moleque, amendoim
    581: "PROTEINA", // Soja, farinha — 36 g de proteína por 100 g
    583: "PROTEINA", // Soja, extrato solúvel, pó
    582: "LATICINIO", // Soja, extrato solúvel, fluido — bebida, não grão
    584: "PROTEINA", // Soja, queijo (tofu)
    121: "BASE_CARBO", // Farinha, de mandioca, crua — a TACO a põe em "Verduras"
    122: "BASE_CARBO", // Farinha, de mandioca, torrada (a farofa)
    123: "BASE_CARBO", // Farinha, de puba
    124: "BASE_CARBO", // Fécula, de mandioca
    131: "BASE_CARBO", // Mandioca, farofa, temperada
    140: "BASE_CARBO", // Pão, de queijo, assado
    141: "BASE_CARBO", // Pão, de queijo, cru
    146: "BASE_CARBO", // Polvilho, doce
    592: "BASE_CARBO", // Farinha, de mesocarpo de babaçu
    595: "BASE_CARBO", // Pinhão, cozido
    596: "BASE_CARBO", // Pupunha, cozida
};

/**
 * A faixa pela densidade energética. Quanto mais concentrado o alimento, menor
 * a porção — é a regra que faz 150 g de arroz e 15 g de azeite saírem da mesma
 * tabela sem uma linha para cada um dos 285 alimentos do catálogo.
 *
 * Os tetos são generosos de propósito: 250 g de arroz cozido é um prato grande
 * e real, cerca de cinco colheres de servir. O que eles impedem é o absurdo, não
 * o apetite.
 */
const FAIXA_POR_DENSIDADE: { ateKcalPor100g: number; faixa: FaixaPorcao }[] = [
    // Arroz, feijão, macarrão, frango, ovo, batata, iogurte, legumes: o que se
    // serve às colheradas.
    { ateKcalPor100g: 200, faixa: { min: 80, usual: 150, max: 250 } },
    // Pão, carnes mais gordas, queijos frescos: às fatias.
    { ateKcalPor100g: 350, faixa: { min: 40, usual: 80, max: 150 } },
    // Farinhas, flocos, leite em pó, queijos duros: às colheres de sopa.
    { ateKcalPor100g: 500, faixa: { min: 15, usual: 30, max: 60 } },
    // Óleos, manteiga, castanhas: ao fio e ao punhado.
    { ateKcalPor100g: Infinity, faixa: { min: 5, usual: 15, max: 30 } },
];

/**
 * Verdura e fruta não seguem a densidade: quase tudo ali é pouco calórico e
 * cairia na primeira faixa, com 250 g de teto. Uma salada de acompanhamento e
 * uma fruta têm porção própria, e inflá-las seria só trocar o excesso de arroz
 * por excesso de alface.
 *
 * Este ajuste só APERTA — ver a guarda em `faixaDe`. "Verduras, hortaliças e
 * derivados" da TACO abriga a farinha de mandioca (365 kcal), a farofa
 * temperada (406) e o pão de queijo (363), porque a raiz é hortaliça; deixar o
 * papel afrouxar a faixa liberaria 200 g de farofa num prato.
 */
const FAIXA_POR_PAPEL: Partial<Record<Papel, FaixaPorcao>> = {
    VEGETAL: { min: 40, usual: 100, max: 200 },
    FRUTA: { min: 80, usual: 130, max: 200 },
};

/**
 * Onde a densidade erra o teto por juntar coisas de mesa muito diferentes.
 * Queijo é o caso claro: o de minas (264 kcal) cairia na faixa do pão, com 150 g
 * de teto — meio quilo de queijo por semana num almoço só.
 */
const FAIXA_POR_ALIMENTO: Record<number, FaixaPorcao> = {
    447: { min: 15, usual: 30, max: 60 }, // Creme de leite
    453: { min: 10, usual: 20, max: 40 }, // Leite, condensado
    461: { min: 20, usual: 50, max: 100 }, // Queijo, minas, frescal
    462: { min: 20, usual: 40, max: 80 }, // Queijo, minas, meia cura
    463: { min: 20, usual: 40, max: 80 }, // Queijo, mozarela
    465: { min: 20, usual: 40, max: 80 }, // Queijo, pasteurizado
    467: { min: 20, usual: 40, max: 80 }, // Queijo, prato
    469: { min: 30, usual: 60, max: 120 }, // Queijo, ricota
};

export function papelDe(alimento: Alimento): Papel {
    return (
        PAPEL_POR_ALIMENTO[alimento.id] ??
        PAPEL_POR_CATEGORIA[alimento.categoria] ??
        // Categoria nova na TACO cai aqui. VEGETAL é a escolha conservadora:
        // porção média e nenhum papel estrutural na conferência de cobertura.
        "VEGETAL"
    );
}

export function faixaDe(alimento: Alimento): FaixaPorcao {
    const porAlimento = FAIXA_POR_ALIMENTO[alimento.id];
    if (porAlimento) return porAlimento;

    const porDensidade = FAIXA_POR_DENSIDADE.find(
        (f) => alimento.kcal <= f.ateKcalPor100g,
    )!.faixa;
    const porPapel = FAIXA_POR_PAPEL[papelDe(alimento)];

    // O ajuste por papel só vale se APERTAR. A densidade é quem sabe quanto se
    // come de um alimento concentrado, e um papel largo sobrescrevendo-a foi o
    // que liberou 200 g de farinha de mandioca num almoço.
    return porPapel && porPapel.max < porDensidade.max ? porPapel : porDensidade;
}

/**
 * Os papéis que contam como fonte de proteína na conferência de cobertura.
 * Queijo e iogurte resolvem a proteína de um lanche tão bem quanto um ovo.
 */
export const PAPEIS_PROTEICOS: readonly Papel[] = ["PROTEINA", "LATICINIO"];
