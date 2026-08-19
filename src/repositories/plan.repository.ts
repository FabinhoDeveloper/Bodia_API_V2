import { PrismaClient } from "@prisma/client";

/**
 * Leitura do plano ativo de um usuário. Traz tudo numa consulta só — usuário,
 * peso mais recente, ficha de treino e ficha de alimentação — porque as telas
 * principais do app precisam de tudo junto ao abrir.
 */
export default class PlanRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }

    /**
     * Só a meta de água da ficha ativa — devolve null se o usuário não existe
     * ou ainda não tem ficha.
     *
     * Existe separado de buscarPlanoAtivo porque a hidratação precisa de um
     * inteiro, e buscarPlanoAtivo traria junto todas as refeições, todos os
     * alimentos e toda a ficha de treino para chegar nele.
     *
     * Fica neste repository, e não no de hidratação, porque FichaAlimentacao é
     * entidade daqui — cada repository acessa uma entidade só.
     */
    async buscarMetaAgua(usuarioId: string): Promise<number | null> {
        const ficha = await this.prismaClient.fichaAlimentacao.findFirst({
            where: { usuarioId, ativa: true },
            select: { metaAguaMl: true },
        });

        return ficha?.metaAguaMl ?? null;
    }

    buscarPlanoAtivo(usuarioId: string) {
        return this.prismaClient.usuario.findUnique({
            where: { id: usuarioId },
            include: {
                // O peso atual é o registro mais recente — não há campo de peso
                // no Usuario justamente para não ter duas cópias.
                pesos: { orderBy: { registradoEm: "desc" }, take: 1 },

                fichasTreino: {
                    where: { ativa: true },
                    take: 1,
                    include: {
                        sessoes: {
                            orderBy: { ordem: "asc" },
                            include: {
                                exercicios: {
                                    orderBy: { ordem: "asc" },
                                    // O nome e o grupo muscular vivem no catálogo,
                                    // não copiados na ficha.
                                    include: { exercicio: true },
                                },
                            },
                        },
                    },
                },

                fichasAlimentacao: {
                    where: { ativa: true },
                    take: 1,
                    include: {
                        refeicoes: {
                            orderBy: { ordem: "asc" },
                            include: { itens: { include: { alimento: true } } },
                        },
                    },
                },
            },
        });
    }
}
