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

    /**
     * A ficha de alimentação ativa, com metas e os ids das refeições — sem os
     * itens nem o catálogo.
     *
     * Serve a três coisas de uma vez no registro de refeição: as metas da
     * resposta, o total de refeições do dia e a CONFERÊNCIA DE POSSE do
     * refeicaoId. Sem essa conferência qualquer um marcaria refeição alheia e
     * somaria macros de outra pessoa no próprio dia.
     */
    buscarFichaAlimentacaoAtiva(usuarioId: string) {
        return this.prismaClient.fichaAlimentacao.findFirst({
            where: { usuarioId, ativa: true },
            select: {
                caloriasAlvo: true,
                proteinaG: true,
                carboidratoG: true,
                gorduraG: true,
                refeicoes: { select: { id: true } },
            },
        });
    }

    buscarPlanoAtivo(usuarioId: string) {
        return this.prismaClient.usuario.findUnique({
            where: { id: usuarioId },
            include: {
                // O peso atual é o registro mais recente — não há campo de peso
                // no Usuario justamente para não ter duas cópias.
                pesos: { orderBy: { registradoEm: "desc" }, take: 1 },

                // A carga de cada exercício vem daqui, e não da ficha: ela
                // pertence ao par (usuário, exercício do catálogo) e precisa
                // sobreviver à troca de ficha. Ver o comentário de
                // CargaExercicio no schema.
                cargas: { select: { exercicioId: true, pesoKg: true } },

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
