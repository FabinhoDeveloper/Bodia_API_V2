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

/**
 * O contrato das três rotas de hidratação — registrar, consultar e desfazer
 * devolvem todas isto.
 *
 * Registrar e desfazer devolverem o dia inteiro, e não só a linha afetada, é o
 * que evita o app ter de fazer um GET depois de cada toque para descobrir o
 * novo total.
 *
 * `metaMl` vem junto para a resposta bastar-se sozinha ("500 de 2000"), mesmo
 * o app já tendo a meta em dieta.metas.aguaMl vinda do plano.
 */
export interface ResumoHidratacaoDia {
    /** "AAAA-MM-DD" no fuso do usuário — ver config/fuso.ts. */
    dia: string;
    totalMl: number;
    metaMl: number;
    registros: RegistroHidratacao[];
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
