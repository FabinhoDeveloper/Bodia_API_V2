import { Exercicio } from "./exercicios";

/**
 * Intervalo de descanso entre séries, derivado do papel do exercício.
 *
 * Antes isto era `descansoSegundos: 60` fixo no plano.mapper — o mesmo valor
 * para o agachamento com barra e para a rosca concentrada. Nem a IA nem o motor
 * prescreviam o número, então o cronômetro de descanso do app contava 60s para
 * tudo.
 *
 * FONTE (ACSM, 2009 — Progression Models in Resistance Training for Healthy
 * Adults): "rest periods of at least 2-3 minutes [...] for core exercises using
 * heavier loads (such as the squat and bench press). In contrast, for assistance
 * exercises [...] a shorter rest period length of 1-2 minutes may suffice."
 *
 * Os valores abaixo são o PISO de cada faixa da ACSM (2 min e 1 min), e não o
 * topo, porque o objetivo predominante aqui é hipertrofia e não força máxima —
 * de Salles et al. (2009, Sports Medicine) registram ~60s como o intervalo
 * comumente recomendado para hipertrofia.
 *
 * Nenhum exercício descansa MENOS do que os 60s que o mapper fixava antes: a
 * mudança é aditiva.
 */

/** Exercício "core" da ACSM: os grandes levantamentos, com carga alta. */
export const DESCANSO_MULTIARTICULAR_S = 120;

/** Exercício "assistance" da ACSM: acessório e isolamento. */
export const DESCANSO_UNIARTICULAR_S = 60;

/**
 * O marcador de "core" no catálogo é caber numa sessão de CORPO INTEIRO.
 *
 * As constantes PUSH_COMPOSTO / PULL_COMPOSTO / PERNA_COMPOSTO em exercicios.ts
 * acrescentam "Corpo inteiro" às sessões justamente dos grandes levantamentos —
 * supino, terra, agachamento, remada, puxada, desenvolvimento. É a mesma lista
 * que a ACSM chama de "core exercises".
 *
 * POR QUE NÃO `articulacoes.length`: foi a primeira tentativa e classifica
 * errado. Aquele campo lista as articulações SOB RISCO DE LESÃO, não as
 * envolvidas no movimento — serve para excluir exercício por lesão, não para
 * medir complexidade. Na prática ele dava 120s ao tríceps testa (por listar
 * cotovelo e punho) e 60s ao afundo (por listar só o joelho), o inverso do
 * certo nos dois casos.
 *
 * O abdômen é excluído à mão: os exercícios de core abdominal também aceitam
 * "Corpo inteiro", mas por caberem numa sessão de corpo inteiro, não por serem
 * levantamentos pesados. Prancha isométrica com 2 minutos de descanso seria
 * absurdo.
 */
const GRUPO_SEM_DESCANSO_LONGO = "Abdômen";

export function ehMultiarticular(exercicio: Exercicio): boolean {
    return (
        exercicio.sessoes.includes("Corpo inteiro") &&
        exercicio.grupoMuscular !== GRUPO_SEM_DESCANSO_LONGO
    );
}

/** Quantos segundos de descanso prescrever entre as séries deste exercício. */
export function descansoPara(exercicio: Exercicio): number {
    return ehMultiarticular(exercicio) ? DESCANSO_MULTIARTICULAR_S : DESCANSO_UNIARTICULAR_S;
}
