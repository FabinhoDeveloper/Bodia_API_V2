/**
 * Tipos dos registros do dia a dia — o que o usuário MARCA, em oposição ao que
 * foi prescrito para ele.
 *
 * A prescrição (ficha de treino, ficha de alimentação) já existe no schema e é
 * lida por PlanService.consultar. Estes registros ainda NÃO têm model no
 * Prisma: hoje o app guarda tudo local. Os tipos ficam aqui para que os
 * services de registro tenham um contrato declarado antes da migration.
 */

export interface RegistroRefeicao {
    id: string;
    usuarioId: string;
    /** FK para Refeicao (a refeição prescrita que foi cumprida). */
    refeicaoId: string;
    registradoEm: Date;
}

export interface RegistroHidratacao {
    id: string;
    usuarioId: string;
    volumeMl: number;
    registradoEm: Date;
}

export interface RegistroTreino {
    id: string;
    usuarioId: string;
    /** FK para SessaoTreino (a sessão prescrita que foi executada). */
    sessaoTreinoId: string;
    iniciadoEm: Date;
    concluidoEm: Date | null;
}

export interface RegistroExercicio {
    id: string;
    registroTreinoId: string;
    /** FK para ExercicioSessao (o exercício prescrito). */
    exercicioSessaoId: string;
    seriesFeitas: number;
    pesoKg: number | null;
}

/** Intervalo de consulta de histórico. */
export interface Periodo {
    de: Date;
    ate: Date;
}
