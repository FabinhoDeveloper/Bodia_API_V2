import { PrismaClient } from "@prisma/client";

import {
    Periodo,
    RegistroRefeicao,
    RegistroRefeicaoComPrescricao,
} from "../types/registro.types";

/** Campos da prescrição que a soma e a tela precisam — nada além disso. */
const PRESCRICAO = {
    select: {
        nome: true,
        horario: true,
        kcal: true,
        proteinaG: true,
        carboidratoG: true,
        gorduraG: true,
    },
} as const;

/**
 * Acesso a RegistroRefeicao.
 *
 * Não há update: marcar insere, desmarcar apaga. Diferente da hidratação,
 * existe no máximo uma linha por (refeição, dia) — quem garante isso é o
 * RefeicaoService, via `buscarNoDia` antes de inserir.
 */
export default class RefeicaoRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }

    criar(registro: Omit<RegistroRefeicao, "id">): Promise<RegistroRefeicao> {
        return this.prismaClient.registroRefeicao.create({ data: registro });
    }

    /**
     * Os registros do período COM os macros de cada refeição prescrita.
     *
     * O include é o que permite somar o dia sem depender da ficha ativa: um
     * registro feito antes de o usuário gerar um plano novo aponta para a ficha
     * antiga, e o JOIN devolve os macros dela do mesmo jeito.
     *
     * `ate` é exclusivo — daí `lt` e não `lte`.
     */
    listarPorPeriodo(
        usuarioId: string,
        periodo: Periodo,
    ): Promise<RegistroRefeicaoComPrescricao[]> {
        return this.prismaClient.registroRefeicao.findMany({
            where: {
                usuarioId,
                registradoEm: { gte: periodo.de, lt: periodo.ate },
            },
            include: { refeicao: PRESCRICAO },
            orderBy: { registradoEm: "asc" },
        });
    }

    /**
     * Quantas refeições o usuário marcou dentro da janela.
     *
     * Serve à decisão de vigência da regeneração (`PlanService.regenerar`): um
     * dia sem nenhuma marcação não tem conta a bagunçar, e o plano novo pode
     * valer na hora em vez de esperar a meia-noite.
     *
     * Um `count` e não um `listarPorPeriodo().length` porque a pergunta é
     * "tem alguma?" — carregar os registros e o JOIN da prescrição para chegar
     * a um número seria trabalho jogado fora.
     */
    contarNoPeriodo(usuarioId: string, periodo: Periodo): Promise<number> {
        return this.prismaClient.registroRefeicao.count({
            where: {
                usuarioId,
                registradoEm: { gte: periodo.de, lt: periodo.ate },
            },
        });
    }

    /** A marcação desta refeição dentro da janela, se já existir. */
    buscarNoDia(
        usuarioId: string,
        refeicaoId: string,
        periodo: Periodo,
    ): Promise<RegistroRefeicao | null> {
        return this.prismaClient.registroRefeicao.findFirst({
            where: {
                usuarioId,
                refeicaoId,
                registradoEm: { gte: periodo.de, lt: periodo.ate },
            },
        });
    }

    /**
     * Desmarca a refeição no dia informado, devolvendo quantas linhas saíram.
     *
     * Filtra por dono E janela na mesma query: sem o usuarioId, um refeicaoId
     * sozinho apagaria a marcação de outra pessoa; sem a janela, apagaria
     * também o histórico dos dias anteriores.
     */
    async remover(usuarioId: string, refeicaoId: string, periodo: Periodo): Promise<number> {
        const { count } = await this.prismaClient.registroRefeicao.deleteMany({
            where: {
                usuarioId,
                refeicaoId,
                registradoEm: { gte: periodo.de, lt: periodo.ate },
            },
        });

        return count;
    }
}
