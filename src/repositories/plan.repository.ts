import { PrismaClient } from "@prisma/client";

import FichaMapper from "../mappers/ficha.mapper";
import { ResultadoCalculo } from "../types/perfil.types";
import { PlanoDTO } from "../types/plano.types";

/**
 * Leitura do plano ativo de um usuário. Traz tudo numa consulta só — usuário,
 * peso mais recente, ficha de treino e ficha de alimentação — porque as telas
 * principais do app precisam de tudo junto ao abrir.
 */
export default class PlanRepository {
    private readonly prismaClient;
    private readonly fichaMapper;

    constructor(prismaClient: PrismaClient, fichaMapper: FichaMapper) {
        this.prismaClient = prismaClient;
        this.fichaMapper = fichaMapper;
    }

    /**
     * Troca as fichas ativas do usuário pelas do plano novo (RF20).
     *
     * A anterior é DESATIVADA, nunca apagada. É o que preserva a evolução das
     * metas e, principalmente, o que mantém o histórico correto: uma refeição
     * marcada de manhã aponta para a `Refeicao` da ficha antiga, e o registro de
     * treino para a `SessaoTreino` dela — apagar a ficha levaria junto o que o
     * usuário fez no dia.
     *
     * Tudo numa transação porque "só uma ficha ativa por usuário" não é
     * constraint no banco: entre desativar e criar não pode haver janela com
     * zero fichas ativas nem com duas.
     */
    /**
     * As restrições declaradas pelo usuário, já separadas por tipo.
     *
     * São o que o `catalogo.filter` usa para remover alimentos e exercícios do
     * prompt ANTES de o modelo os ver. Regenerar sem elas devolveria frango a um
     * vegano — é o único pedaço do perfil que não está na tabela `Usuario`.
     */
    async buscarRestricoes(
        usuarioId: string,
    ): Promise<{ restricoesAlimentares: string[]; restricoesFisicas: string[] }> {
        const restricoes = await this.prismaClient.restricao.findMany({
            where: { usuarioId },
            select: { tipo: true, descricao: true },
        });

        return {
            restricoesAlimentares: restricoes
                .filter((r) => r.tipo === "ALIMENTAR")
                .map((r) => r.descricao),
            restricoesFisicas: restricoes
                .filter((r) => r.tipo === "FISICA")
                .map((r) => r.descricao),
        };
    }

    async substituirFichas(
        usuarioId: string,
        plano: PlanoDTO,
        resultado: ResultadoCalculo,
    ): Promise<void> {
        await this.prismaClient.$transaction([
            this.prismaClient.fichaTreino.updateMany({
                where: { usuarioId, ativa: true },
                data: { ativa: false },
            }),
            this.prismaClient.fichaAlimentacao.updateMany({
                where: { usuarioId, ativa: true },
                data: { ativa: false },
            }),
            this.prismaClient.fichaTreino.create({
                data: { usuarioId, ...this.fichaMapper.treino(plano, resultado) },
            }),
            this.prismaClient.fichaAlimentacao.create({
                data: { usuarioId, ...this.fichaMapper.alimentacao(plano, resultado) },
            }),
        ]);
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

    /**
     * Reescreve as metas da ficha de alimentação ativa com os números
     * recalculados (RF34).
     *
     * Só as METAS mudam — as refeições prescritas continuam as mesmas. A ficha
     * não é regenerada aqui de propósito: trocar o cardápio inteiro porque o
     * usuário se pesou seria uma decisão dele (RF20), não um efeito colateral de
     * subir na balança. A resposta sinaliza a defasagem e o app oferece regerar.
     *
     * Devolve `false` quando não havia ficha ativa, para quem chama distinguir
     * "atualizei" de "não havia o que atualizar".
     */
    async atualizarMetasDaFichaAtiva(
        usuarioId: string,
        metas: {
            tmb: number;
            tdee: number;
            caloriasAlvo: number;
            proteinaG: number;
            carboidratoG: number;
            gorduraG: number;
            metaAguaMl: number;
        },
    ): Promise<boolean> {
        const { count } = await this.prismaClient.fichaAlimentacao.updateMany({
            where: { usuarioId, ativa: true },
            data: metas,
        });

        return count > 0;
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
