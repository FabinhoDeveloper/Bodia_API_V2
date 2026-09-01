import { PrismaClient } from "@prisma/client";

import { Periodo, RegistroTreino, SerieExecutada } from "../types/registro.types";

/**
 * Acesso a RegistroTreino e RegistroSerie.
 *
 * As séries não têm repository próprio: nunca são lidas nem escritas fora do
 * treino a que pertencem, e uma classe só para elas seria uma camada a
 * atravessar sem nada a decidir.
 */
export default class TreinoRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }

    /** Abre um treino: linha criada com `concluidoEm` nulo. */
    abrir(usuarioId: string, sessaoTreinoId: string): Promise<RegistroTreino> {
        return this.prismaClient.registroTreino.create({
            data: { usuarioId, sessaoTreinoId },
        });
    }

    /**
     * O treino aberto (não concluído) desta sessão, se houver.
     *
     * Serve para não abrir dois: quem sai da tela da série e volta continua o
     * mesmo treino em vez de começar outro e deixar o primeiro pendurado.
     */
    buscarAberto(usuarioId: string, sessaoTreinoId: string): Promise<RegistroTreino | null> {
        return this.prismaClient.registroTreino.findFirst({
            where: { usuarioId, sessaoTreinoId, concluidoEm: null },
            orderBy: { iniciadoEm: "desc" },
        });
    }

    buscarPorId(usuarioId: string, id: string): Promise<RegistroTreino | null> {
        // O usuarioId entra no `where`, e não é conferido depois de ler: com a
        // conferência posterior, esquecer um `if` devolveria o treino alheio.
        return this.prismaClient.registroTreino.findFirst({ where: { id, usuarioId } });
    }

    /**
     * Fecha o treino e grava as séries numa transação só.
     *
     * As duas coisas juntas porque um treino concluído sem séries é pior que um
     * treino que ficou aberto: a tela de resumo mostraria zero repetições para
     * uma sessão que o usuário acabou de fazer.
     *
     * `deleteMany` antes do `createMany` torna a chamada IDEMPOTENTE — reenviar
     * depois de uma falha de rede substitui as séries em vez de duplicá-las. É a
     * mesma preocupação que fez `POST /api/refeicao` ser idempotente.
     */
    async concluir(id: string, series: SerieExecutada[]): Promise<void> {
        await this.prismaClient.$transaction([
            this.prismaClient.registroSerie.deleteMany({ where: { registroTreinoId: id } }),
            this.prismaClient.registroSerie.createMany({
                data: series.map((serie) => ({ ...serie, registroTreinoId: id })),
            }),
            this.prismaClient.registroTreino.update({
                where: { id },
                data: { concluidoEm: new Date() },
            }),
        ]);
    }

    /**
     * Os treinos CONCLUÍDOS do período, com as séries e o nome da sessão.
     *
     * `concluidoEm: { not: null }` é o que separa "fiz" de "comecei": uma sessão
     * abandonada no meio não pode marcar o card da semana como feito.
     *
     * `ate` é exclusivo — daí `lt` e não `lte`.
     */
    listarConcluidos(usuarioId: string, periodo: Periodo) {
        return this.prismaClient.registroTreino.findMany({
            where: {
                usuarioId,
                concluidoEm: { not: null },
                iniciadoEm: { gte: periodo.de, lt: periodo.ate },
            },
            include: {
                sessaoTreino: { select: { nome: true } },
                series: { orderBy: { ordem: "asc" } },
            },
            orderBy: { iniciadoEm: "asc" },
        });
    }

    /**
     * Grava a carga de cada exercício no catálogo — o valor que o app
     * pré-preenche na próxima vez.
     *
     * `upsert` porque não se sabe se é a primeira vez: um `create` falharia na
     * segunda, e um `update` na primeira. Uma linha por par (usuário,
     * exercício), sobrescrita a cada treino.
     */
    async registrarCargas(
        usuarioId: string,
        cargas: { exercicioId: number; pesoKg: number }[],
    ): Promise<void> {
        await this.prismaClient.$transaction(
            cargas.map(({ exercicioId, pesoKg }) =>
                this.prismaClient.cargaExercicio.upsert({
                    where: { usuarioId_exercicioId: { usuarioId, exercicioId } },
                    create: { usuarioId, exercicioId, pesoKg },
                    update: { pesoKg },
                }),
            ),
        );
    }

    /**
     * Os exercícios prescritos de uma sessão, com o id do exercício no catálogo.
     *
     * Devolve `null` quando a sessão não é do usuário — a conferência de posse
     * do `sessaoTreinoId`, sem a qual daria para abrir um treino sobre a ficha
     * de outra pessoa. Mesma natureza da conferência do `refeicaoId` no
     * RefeicaoService.
     */
    async buscarExerciciosDaSessao(usuarioId: string, sessaoTreinoId: string) {
        const sessao = await this.prismaClient.sessaoTreino.findFirst({
            where: { id: sessaoTreinoId, fichaTreino: { usuarioId } },
            select: { exercicios: { select: { id: true, exercicioId: true } } },
        });

        return sessao?.exercicios ?? null;
    }
}
