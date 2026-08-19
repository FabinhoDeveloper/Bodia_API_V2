import { PrismaClient } from "@prisma/client";

import { Periodo, RegistroHidratacao } from "../types/registro.types";

/**
 * Acesso a RegistroHidratacao. Como a tabela é um log de eventos, não há
 * update: registrar insere, desfazer apaga.
 */
export default class HidratacaoRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }

    criar(registro: Omit<RegistroHidratacao, "id">): Promise<RegistroHidratacao> {
        return this.prismaClient.registroHidratacao.create({ data: registro });
    }

    /**
     * `ate` é exclusivo — daí `lt` e não `lte`. Ordenado do mais antigo para o
     * mais novo porque é assim que o app lista o dia, e porque o "desfazer"
     * precisa do último elemento.
     */
    listarPorPeriodo(usuarioId: string, periodo: Periodo): Promise<RegistroHidratacao[]> {
        return this.prismaClient.registroHidratacao.findMany({
            where: {
                usuarioId,
                registradoEm: { gte: periodo.de, lt: periodo.ate },
            },
            orderBy: { registradoEm: "asc" },
        });
    }

    /**
     * Apaga filtrando por id E usuarioId na MESMA query, devolvendo quantas
     * linhas saíram.
     *
     * O filtro duplo é o que impede apagar registro alheio, e fazê-lo numa
     * query só evita o buscar-conferir-apagar, que tem corrida entre a
     * conferência e o delete. `count === 0` cobre os dois casos de uma vez:
     * o registro não existe, ou não é de quem pediu.
     */
    async remover(usuarioId: string, registroId: string): Promise<number> {
        const { count } = await this.prismaClient.registroHidratacao.deleteMany({
            where: { id: registroId, usuarioId },
        });

        return count;
    }
}
