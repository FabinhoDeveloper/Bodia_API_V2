import { PapelGrupo, VolumeGrupo } from "../types/perfil.types";

/**
 * Limites e política de volume de treino.
 *
 * Ficam num arquivo próprio porque são consumidos por três lugares que não
 * podem divergir: o EngineService (que monta o orçamento), o TreinoPrompt (que
 * o descreve ao modelo) e o ValidadorVolume (que confere o que voltou).
 *
 * HISTÓRICO — por que isto existe: os limites viviam só como frase dentro do
 * prompt, e o volume vinha como um total semanal para o LLM dividir. As duas
 * coisas nunca foram confrontadas, e não fechavam: em 13 das 15 combinações de
 * dias x nível, o orçamento exigia mais exercícios do que o próprio prompt
 * permitia. O modelo recebia uma tarefa impossível e devolvia algo arbitrário.
 */

/**
 * Limites por sessão. O de exercícios existe porque, em teste real, o modelo
 * leu "18 séries por grupo na semana" como "18 séries deste exercício" e montou
 * sessões de 15 exercícios.
 */
export const MIN_EXERCICIOS_POR_SESSAO = 4;
export const MAX_EXERCICIOS_POR_SESSAO = 8;
export const MIN_SERIES_POR_EXERCICIO = 2;
export const MAX_SERIES_POR_EXERCICIO = 5;

/**
 * Teto de séries de UM grupo em UMA sessão.
 *
 * Sem ele, um split que treina o grupo uma vez por semana (o PPL de 3 dias)
 * empilhava o volume semanal inteiro numa sessão só — o orçamento chegou a
 * pedir 18 séries de peito num treino. Cabia no limite de exercícios e era
 * treino nenhum: volume por sessão tem retorno decrescente muito antes disso.
 *
 * A consequência é deliberada e honesta: em splits de baixa frequência, o total
 * semanal fica ABAIXO do alvo, e o ValidadorVolume reporta essa diferença. É a
 * mesma limitação que o comentário de SPLIT_POR_DIAS já reconhece para 3 dias
 * ("abaixo do ideal, trade-off aceito por causa da disponibilidade de dias") —
 * agora ela aparece medida, em vez de virar uma sessão absurda.
 */
export const MAX_SERIES_POR_GRUPO_SESSAO = 10;

/**
 * Fração do volume primário que vai aos grupos secundários.
 *
 * FONTE A LEVANTAR (fundamentação teórica): duas afirmações sustentam este
 * número e ainda não têm citação no projeto —
 *   (a) grupos musculares pequenos exigem menos volume DIRETO que os grandes;
 *   (b) exercícios compostos entregam estímulo indireto relevante a bíceps e
 *       tríceps, de modo que o volume direto deles pode ser menor.
 * O volume dos grupos primários, esse sim, deve estar coberto pela dose-resposta
 * já citada (SCHOENFELD; OGBORN; KRIEGER, 2016; PELLAND et al., 2024) — vale
 * confirmar que a faixa 10/14/18 sai de fato dessas fontes.
 */
export const FRACAO_SECUNDARIO = 0.5;

/**
 * Quais grupos cada sessão treina, e em que papel.
 *
 * Fica AQUI, e não derivado de data/exercicios.ts, porque são duas decisões
 * diferentes: o catálogo diz quais exercícios CABEM numa sessão; esta tabela
 * diz quais grupos recebem VOLUME. Derivar do catálogo faria o filtro de
 * restrição (que remove exercícios) alterar a prescrição sem ninguém pedir.
 *
 * Os nomes precisam bater com `grupoMuscular` em data/exercicios.ts e com os
 * nomes de sessão em EngineService.SPLIT_POR_DIAS.
 */
export const GRUPOS_POR_SESSAO: Record<string, Record<PapelGrupo, string[]>> = {
    Upper: {
        primario: ["Peito", "Costas", "Ombro"],
        secundario: ["Bíceps", "Tríceps"],
    },
    Lower: {
        primario: ["Quadríceps", "Posterior de coxa", "Glúteo"],
        secundario: ["Panturrilha", "Abdômen"],
    },
    Push: {
        primario: ["Peito", "Ombro"],
        secundario: ["Tríceps"],
    },
    Pull: {
        primario: ["Costas"],
        secundario: ["Bíceps", "Trapézio"],
    },
    Legs: {
        primario: ["Quadríceps", "Posterior de coxa", "Glúteo"],
        secundario: ["Panturrilha"],
    },
    "Corpo inteiro": {
        primario: ["Peito", "Costas", "Quadríceps"],
        secundario: ["Ombro", "Posterior de coxa"],
    },
};

/** Quantos exercícios um orçamento exige, no melhor caso. */
export function exerciciosNecessarios(volume: VolumeGrupo[]): number {
    return volume.reduce(
        (total, item) => total + Math.ceil(item.series / MAX_SERIES_POR_EXERCICIO),
        0,
    );
}

/** Se o orçamento cabe nos limites da sessão. */
export function cabeNaSessao(volume: VolumeGrupo[]): boolean {
    return exerciciosNecessarios(volume) <= MAX_EXERCICIOS_POR_SESSAO;
}
