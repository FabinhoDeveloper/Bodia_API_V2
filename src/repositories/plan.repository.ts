import { PrismaClient } from "@prisma/client";

import FichaMapper from "../mappers/ficha.mapper";
import { ResultadoCalculo } from "../types/perfil.types";
import { PlanoDTO } from "../types/plano.types";

/**
 * Leitura do plano vigente de um usuário. Traz tudo numa consulta só — usuário,
 * peso mais recente, ficha de treino e ficha de alimentação — porque as telas
 * principais do app precisam de tudo junto ao abrir.
 *
 * VIGENTE, e não "ativa": desde que a regeneração passou a valer só no dia
 * seguinte, `ativa` significa NÃO SUBSTITUÍDA, e um usuário pode ter duas — a
 * que vale hoje e a agendada para amanhã. Quem separa as duas é `vigenteDe`.
 * Ver o comentário de `FichaTreino` no schema.
 */
export default class PlanRepository {
    private readonly prismaClient;
    private readonly fichaMapper;

    constructor(prismaClient: PrismaClient, fichaMapper: FichaMapper) {
        this.prismaClient = prismaClient;
        this.fichaMapper = fichaMapper;
    }

    /**
     * O filtro da ficha EM VIGOR num instante: ativa e já vigente.
     *
     * Vem acompanhado de `orderBy: { vigenteDe: "desc" }` em toda consulta que
     * o usa — sem ele, a ficha de ontem e a que entrou em vigor à meia-noite
     * empatariam e a escolha seria loteria.
     */
    private static vigenteEm(usuarioId: string, agora: Date) {
        return { usuarioId, ativa: true, vigenteDe: { lte: agora } };
    }

    /** O filtro da ficha AGENDADA: ativa, mas ainda não em vigor. */
    private static agendadaEm(usuarioId: string, agora: Date) {
        return { usuarioId, ativa: true, vigenteDe: { gt: agora } };
    }

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

    /**
     * Grava as fichas do plano novo com a vigência que o service decidiu (RF20).
     *
     * A anterior é DESATIVADA, nunca apagada. É o que preserva a evolução das
     * metas e, principalmente, o que mantém o histórico correto: uma refeição
     * marcada de manhã aponta para a `Refeicao` da ficha antiga, e o registro de
     * treino para a `SessaoTreino` dela — apagar a ficha levaria junto o que o
     * usuário fez no dia.
     *
     * Dois ramos, conforme `vigenteDe`:
     *
     * - **imediato** (`vigenteDe <= agora`): desativa TODAS as ativas e cria as
     *   novas já valendo. É o caminho do dia sem nenhuma refeição marcada, e é
     *   exatamente o comportamento que a rota tinha antes da vigência existir.
     * - **agendado** (`vigenteDe > agora`): desativa todas as ativas EXCETO o
     *   par que está em vigor, que precisa continuar respondendo pelo dia de
     *   hoje. O "exceto" também limpa a ficha agendada de uma regeneração
     *   anterior no mesmo dia — pedir dois planos hoje deixa valendo o segundo,
     *   não os dois.
     *
     * Tudo numa transação porque o limite de fichas ativas não é constraint no
     * banco: entre desativar e criar não pode haver janela com zero fichas em
     * vigor nem com duas agendadas.
     */
    async gravarFichas(
        usuarioId: string,
        plano: PlanoDTO,
        resultado: ResultadoCalculo,
        vigenteDe: Date,
    ): Promise<void> {
        const agora = new Date();
        const imediato = vigenteDe <= agora;

        await this.prismaClient.$transaction(async (tx) => {
            // Os ids do par em vigor, lidos DENTRO da transação: fora dela, uma
            // virada de meia-noite entre a leitura e a escrita poderia preservar
            // a ficha errada.
            const [treinoVigente, dietaVigente] = imediato
                ? [null, null]
                : await Promise.all([
                      tx.fichaTreino.findFirst({
                          where: PlanRepository.vigenteEm(usuarioId, agora),
                          orderBy: { vigenteDe: "desc" },
                          select: { id: true },
                      }),
                      tx.fichaAlimentacao.findFirst({
                          where: PlanRepository.vigenteEm(usuarioId, agora),
                          orderBy: { vigenteDe: "desc" },
                          select: { id: true },
                      }),
                  ]);

            await tx.fichaTreino.updateMany({
                where: {
                    usuarioId,
                    ativa: true,
                    ...(treinoVigente ? { id: { not: treinoVigente.id } } : {}),
                },
                data: { ativa: false },
            });
            await tx.fichaAlimentacao.updateMany({
                where: {
                    usuarioId,
                    ativa: true,
                    ...(dietaVigente ? { id: { not: dietaVigente.id } } : {}),
                },
                data: { ativa: false },
            });

            await tx.fichaTreino.create({
                data: { usuarioId, vigenteDe, ...this.fichaMapper.treino(plano, resultado) },
            });
            await tx.fichaAlimentacao.create({
                data: { usuarioId, vigenteDe, ...this.fichaMapper.alimentacao(plano, resultado) },
            });
        });
    }

    /**
     * O dia em que o plano agendado entra em vigor, ou null se não há nenhum.
     *
     * Consulta à parte, e não um segundo `include` em `buscarPlanoAtivo`: o
     * Prisma não deixa filtrar a MESMA relação duas vezes no mesmo `include`, e
     * esta aqui custa uma coluna.
     *
     * Olha só a ficha de alimentação porque as duas fichas de um plano são
     * gravadas juntas, com o mesmo `vigenteDe` — perguntar às duas seria
     * perguntar duas vezes a mesma coisa.
     */
    async buscarVigenciaAgendada(usuarioId: string): Promise<Date | null> {
        const ficha = await this.prismaClient.fichaAlimentacao.findFirst({
            where: PlanRepository.agendadaEm(usuarioId, new Date()),
            orderBy: { vigenteDe: "asc" },
            select: { vigenteDe: true },
        });

        return ficha?.vigenteDe ?? null;
    }

    /**
     * Só a meta de água da ficha vigente — devolve null se o usuário não existe
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
            where: PlanRepository.vigenteEm(usuarioId, new Date()),
            orderBy: { vigenteDe: "desc" },
            select: { metaAguaMl: true },
        });

        return ficha?.metaAguaMl ?? null;
    }

    /**
     * A ficha de alimentação vigente, com metas e os ids das refeições — sem os
     * itens nem o catálogo.
     *
     * Serve a três coisas de uma vez no registro de refeição: as metas da
     * resposta, o total de refeições do dia e a CONFERÊNCIA DE POSSE do
     * refeicaoId. Sem essa conferência qualquer um marcaria refeição alheia e
     * somaria macros de outra pessoa no próprio dia.
     *
     * Por tabela, a conferência também recusa o id de uma refeição AGENDADA: a
     * dieta de amanhã não é marcável hoje, e isso sai de graça do filtro de
     * vigência.
     */
    buscarFichaAlimentacaoVigente(usuarioId: string) {
        return this.prismaClient.fichaAlimentacao.findFirst({
            where: PlanRepository.vigenteEm(usuarioId, new Date()),
            orderBy: { vigenteDe: "desc" },
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
     * Reescreve as metas de alimentação com os números recalculados (RF34).
     *
     * O alvo é a ficha AGENDADA quando existe uma, e só na falta dela a
     * vigente. Havendo plano marcado para amanhã, mexer na meta de hoje seria
     * mudar o denominador contra o qual o usuário já comeu — a mesma
     * incoerência que a vigência foi criada para tirar da tela.
     *
     * Só as METAS mudam — as refeições prescritas continuam as mesmas. A ficha
     * não é regenerada aqui de propósito: trocar o cardápio inteiro porque o
     * usuário se pesou seria uma decisão dele (RF20), não um efeito colateral de
     * subir na balança. A resposta sinaliza a defasagem e o app oferece regerar.
     *
     * Devolve `false` quando não havia ficha nenhuma, para quem chama distinguir
     * "atualizei" de "não havia o que atualizar".
     */
    async atualizarMetasDaProximaFicha(
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
        const agora = new Date();

        // `update` por id, e não `updateMany` pelo filtro: com uma agendada e
        // uma vigente ao mesmo tempo, o updateMany escreveria nas duas.
        const alvo =
            (await this.prismaClient.fichaAlimentacao.findFirst({
                where: PlanRepository.agendadaEm(usuarioId, agora),
                orderBy: { vigenteDe: "asc" },
                select: { id: true },
            })) ??
            (await this.prismaClient.fichaAlimentacao.findFirst({
                where: PlanRepository.vigenteEm(usuarioId, agora),
                orderBy: { vigenteDe: "desc" },
                select: { id: true },
            }));

        if (!alvo) return false;

        await this.prismaClient.fichaAlimentacao.update({
            where: { id: alvo.id },
            data: metas,
        });

        return true;
    }

    buscarPlanoAtivo(usuarioId: string) {
        const agora = new Date();

        // O filtro de vigência entra nos includes ANINHADOS, e por isso não
        // reaproveita `vigenteEm`: ali dentro o usuarioId já é o da relação.
        const emVigor = { ativa: true, vigenteDe: { lte: agora } } as const;
        const maisRecente = { vigenteDe: "desc" } as const;

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
                    where: emVigor,
                    orderBy: maisRecente,
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
                    where: emVigor,
                    orderBy: maisRecente,
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
