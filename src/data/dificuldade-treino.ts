import { Exercicio } from "./exercicios";

/**
 * Quão exigente em TÉCNICA é cada exercício, e o que cada nível de experiência
 * pode receber.
 *
 * ## Por que existe
 *
 * Gerando um plano para uma iniciante, o treino vinha com agachamento livre com
 * barra e supino com barra. Era inevitável: `nivelExperiencia` era lido em um
 * único ponto do código inteiro (`EngineService.calcularTreino`, para escolher
 * 10/14/18 séries por grupo) e sumia. Para o seletor de exercícios,
 * "Agachamento livre com barra" e "Cadeira extensora" eram indistinguíveis.
 *
 * ## O que a literatura sustenta, e o que não sustenta
 *
 * A fundamentação teórica do projeto NÃO cobre seleção de exercício por nível —
 * a seção 3.3 vai de volume a splits e para. O que existe fora dela:
 *
 * - **Máquina e peso livre entregam o mesmo resultado.** Haugen et al. (2023),
 *   meta-análise de 13 estudos e 1016 participantes: sem diferença em
 *   hipertrofia, e o ganho de força é específico da modalidade testada. Sem
 *   diferença entre treinados e destreinados. Ou seja, pôr iniciante em máquina
 *   NÃO custa resultado.
 * - **O ACSM não manda evitar barra.** O position stand de 2009 (Ratamess et
 *   al.) recomenda INCLUIR peso livre e máquina, mono e multiarticulares, em
 *   iniciantes, intermediários e avançados. Por isso o corte aqui é por
 *   COMPLEXIDADE, e não por "peso livre": rosca direta com barra continua
 *   entrando no catálogo de um iniciante.
 * - **O que sustenta o corte é técnica e supervisão.** Lesão em treino resistido
 *   vem de técnica ruim, carga excessiva e ausência de supervisão qualificada, e
 *   o risco é maior em ambiente não supervisionado. O BodIA prescreve para quem
 *   treina SOZINHO, sem ninguém corrigindo — e, como peso livre não compra
 *   hipertrofia extra, enviesar o começo para movimento guiado sai de graça.
 *
 * ## Por que é derivado, e não um campo
 *
 * Mesma forma de `descanso-treino.ts`: atributo calculado por função pura a
 * partir de um campo objetivo, em vez de guardado na interface. `equipamento`
 * é conferível lendo o nome do exercício; "dificuldade" seria juízo, e juízo
 * escrito 100 vezes não pode ser auditado nem corrigido de uma vez só.
 *
 * A regra é EQUIPAMENTO x TAMANHO DO GRUPO, que é exatamente o conselho de
 * quadra: para músculo grande, prefira máquina.
 *
 * Ver também `data/volume-treino.ts`, que guarda o teto por nível.
 */

export type Dificuldade = "FACIL" | "MEDIO" | "DIFICIL";

/** Da mais simples para a mais exigente — a ordem é usada para comparar tetos. */
export const DIFICULDADES: readonly Dificuldade[] = ["FACIL", "MEDIO", "DIFICIL"];

/**
 * Os grupos em que a carga é pequena e o movimento, curto.
 *
 * DECISÃO DE ENGENHARIA, sem fonte — é o mesmo recorte que o projeto já usa ao
 * falar de volume reduzido para grupo pequeno (`FRACAO_SECUNDARIO`, em
 * `volume-treino.ts`). A justificativa é de bom senso e vale ser dita: uma rosca
 * direta com barra errada custa um cotovelo dolorido; um agachamento com barra
 * errado custa uma lombar. O risco de uma técnica ruim escala com a carga, e a
 * carga escala com o tamanho do músculo.
 */
const GRUPOS_PEQUENOS = ["Bíceps", "Tríceps", "Panturrilha", "Antebraço", "Trapézio", "Abdômen"];

/**
 * A regra. Equipamento guiado é fácil em qualquer grupo; barra em músculo grande
 * é o extremo oposto.
 *
 * O smith entra junto de máquina e polia de propósito: a barra é guiada por
 * trilho, que é justamente o que tira do exercício a exigência de estabilização
 * — é um agachamento sem o requisito técnico do agachamento livre.
 */
const REGRA: Record<Exercicio["equipamento"], { pequeno: Dificuldade; grande: Dificuldade }> = {
    MAQUINA: { pequeno: "FACIL", grande: "FACIL" },
    POLIA: { pequeno: "FACIL", grande: "FACIL" },
    SMITH: { pequeno: "FACIL", grande: "FACIL" },
    HALTER: { pequeno: "FACIL", grande: "MEDIO" },
    PESO_CORPORAL: { pequeno: "FACIL", grande: "MEDIO" },
    BARRA: { pequeno: "MEDIO", grande: "DIFICIL" },
};

/**
 * O que a regra classifica mal, com o motivo em cada linha.
 *
 * Só entram aqui os casos em que a regra erra — o resto sai dela e não é
 * repetido. Mesmo princípio de `PAPEL_POR_ALIMENTO`, em `data/porcoes.ts`.
 */
const DIFICULDADE_POR_EXERCICIO: Record<number, Dificuldade> = {
    // Peso corporal, mas exigem levantar o próprio corpo: a iniciante média não
    // faz uma repetição, e a regra as daria como MEDIO por serem grupo grande.
    12: "DIFICIL", // Mergulho em paralelas
    14: "DIFICIL", // Barra fixa pronada
    15: "DIFICIL", // Barra fixa supinada
    16: "DIFICIL", // Barra fixa pegada neutra

    // Prensa multiarticular com barra livre. Está catalogado em Tríceps, que é
    // grupo pequeno, então a regra o daria como MEDIO — mas o que ele exige de
    // técnica é o de um supino, não o de uma rosca.
    55: "DIFICIL", // Supino fechado

    // Barra, mas amplitude curta, tronco apoiado no banco e quadril no chão. É o
    // exercício de glúteo que se indica para começar, não o que se evita.
    75: "MEDIO", // Elevação pélvica (hip thrust)

    // Peso corporal em grupo pequeno cairia em FACIL, mas as duas exigem
    // sustentar o corpo suspenso ou fora do apoio.
    90: "MEDIO", // Elevação de joelhos suspenso
    91: "MEDIO", // Abdominal canivete
};

/** A dificuldade técnica de um exercício. */
export function dificuldadeDe(exercicio: Exercicio): Dificuldade {
    const excecao = DIFICULDADE_POR_EXERCICIO[exercicio.id];
    if (excecao) return excecao;

    const porte = GRUPOS_PEQUENOS.includes(exercicio.grupoMuscular) ? "pequeno" : "grande";

    return REGRA[exercicio.equipamento][porte];
}

/** Se `dificuldade` cabe dentro de `teto`. */
export function cabeNoTeto(dificuldade: Dificuldade, teto: Dificuldade): boolean {
    return DIFICULDADES.indexOf(dificuldade) <= DIFICULDADES.indexOf(teto);
}

/**
 * O teto imediatamente acima, ou o próprio quando já é o máximo.
 *
 * Usado pelo `CatalogoFilter` para relaxar um degrau quando o corte por nível
 * deixaria um grupo muscular sem nenhum exercício.
 */
export function proximoTeto(teto: Dificuldade): Dificuldade {
    const i = DIFICULDADES.indexOf(teto);

    return DIFICULDADES[Math.min(i + 1, DIFICULDADES.length - 1)];
}
