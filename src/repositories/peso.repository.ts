import { PrismaClient } from "@prisma/client";

/**
 * Acesso a RegistroPeso — o histórico de peso do usuário.
 *
 * Não há update nem delete: pesar-se é um EVENTO, e o peso atual é o registro
 * mais recente. Sobrescrever uma linha apagaria a evolução, que é justamente o
 * que este histórico existe para mostrar.
 */
export default class PesoRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }

    async criar(usuarioId: string, pesoKg: number): Promise<void> {
        await this.prismaClient.registroPeso.create({ data: { usuarioId, pesoKg } });
    }

    /**
     * O histórico, do mais recente para o mais antigo.
     *
     * O primeiro item é o PESO ATUAL — não há campo de peso em `Usuario`
     * justamente para não existirem duas cópias que possam divergir.
     */
    listar(usuarioId: string, limite: number) {
        return this.prismaClient.registroPeso.findMany({
            where: { usuarioId },
            orderBy: { registradoEm: "desc" },
            take: limite,
            select: { id: true, pesoKg: true, registradoEm: true },
        });
    }

    /**
     * O usuário com os campos que o motor consome, mais o peso atual.
     *
     * Vem daqui, e não do PlanRepository, porque `buscarPlanoAtivo` traria junto
     * todas as refeições, todos os itens e a ficha de treino inteira para chegar
     * a nove colunas.
     */
    buscarPerfil(usuarioId: string) {
        return this.prismaClient.usuario.findUnique({
            where: { id: usuarioId },
            select: {
                sexo: true,
                dataNascimento: true,
                alturaCm: true,
                percentualGordura: true,
                nivelAtividade: true,
                nivelExperiencia: true,
                objetivo: true,
                diasPorSemana: true,
                numeroRefeicoes: true,
                pesos: { orderBy: { registradoEm: "desc" }, take: 1, select: { pesoKg: true } },
            },
        });
    }
}
