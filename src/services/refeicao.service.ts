import { diaISO, janelaDoDia } from "../config/fuso";
import NaoEncontradoError from "../errors/nao-encontrado.error";
import ValidationError from "../errors/validation.error";
import PlanRepository from "../repositories/plan.repository";
import {
    Macros,
    Periodo,
    RegistroRefeicao,
    RegistroRefeicaoComPrescricao,
    ResumoRefeicoesDia,
} from "../types/registro.types";

/**
 * Domínio da refeição executada: marcar como comida, consultar o dia e
 * desmarcar.
 *
 * A PRESCRIÇÃO já existia — model Refeicao, dentro de FichaAlimentacao, com
 * kcal e os três macros. O que mora aqui é o REGISTRO: o usuário marcar que
 * comeu. Por enquanto ele não descreve o que comeu de fato, só confirma a
 * refeição prescrita.
 *
 * Diferente da hidratação, isto é um TOGGLE e não um log: existe no máximo um
 * registro por (refeição, dia). Ver `registrar` para como isso é garantido.
 */
export interface RefeicaoRepository {
    criar(registro: Omit<RegistroRefeicao, "id">): Promise<RegistroRefeicao>;
    listarPorPeriodo(
        usuarioId: string,
        periodo: Periodo,
    ): Promise<RegistroRefeicaoComPrescricao[]>;
    buscarNoDia(
        usuarioId: string,
        refeicaoId: string,
        periodo: Periodo,
    ): Promise<RegistroRefeicao | null>;
    /** Quantas linhas saíram: 0 significa "não estava marcada". */
    remover(usuarioId: string, refeicaoId: string, periodo: Periodo): Promise<number>;
}

/** A ficha ativa como o PlanRepository a devolve. */
type FichaAtiva = NonNullable<
    Awaited<ReturnType<PlanRepository["buscarFichaAlimentacaoAtiva"]>>
>;

export default class RefeicaoService {
    private readonly refeicaoRepository;
    private readonly planRepository;

    constructor(refeicaoRepository: RefeicaoRepository, planRepository: PlanRepository) {
        this.refeicaoRepository = refeicaoRepository;
        this.planRepository = planRepository;
    }

    /**
     * Marca uma refeição prescrita como consumida.
     *
     * É IDEMPOTENTE: marcar de novo no mesmo dia não cria outra linha, devolve
     * o dia como está. Isso não é refinamento — com a UI otimista do app, um
     * reenvio depois de falha de rede é rotina, e sem esta checagem o almoço
     * entraria duas vezes na conta de calorias.
     *
     * A janela de corrida entre o buscarNoDia e o criar é aceita
     * conscientemente: fechá-la exigiria um índice único por expressão, que
     * espalharia o offset do fuso para fora de config/fuso.ts.
     */
    async registrar(usuarioId: string, refeicaoId: string): Promise<ResumoRefeicoesDia> {
        if (!refeicaoId) {
            throw new ValidationError("refeicaoId é obrigatório");
        }

        const ficha = await this.exigirFicha(usuarioId);

        // Conferência de posse. Sem ela, um refeicaoId de outra pessoa entraria
        // no dia deste usuário e somaria macros que não são dele.
        if (!ficha.refeicoes.some((refeicao) => refeicao.id === refeicaoId)) {
            throw new NaoEncontradoError("Refeição não encontrada no plano do usuário");
        }

        const agora = new Date();
        const janela = janelaDoDia(agora);

        const jaMarcada = await this.refeicaoRepository.buscarNoDia(
            usuarioId,
            refeicaoId,
            janela,
        );

        if (!jaMarcada) {
            await this.refeicaoRepository.criar({
                usuarioId,
                refeicaoId,
                registradoEm: agora,
            });
        }

        return this.montarDia(usuarioId, agora, ficha);
    }

    /** As refeições marcadas num dia, com o consumido — é o que a Dieta mostra. */
    async doDia(usuarioId: string, dia: Date): Promise<ResumoRefeicoesDia> {
        return this.montarDia(usuarioId, dia, await this.exigirFicha(usuarioId));
    }

    /** Desmarca a refeição de hoje e devolve o dia já atualizado. */
    async remover(usuarioId: string, refeicaoId: string): Promise<ResumoRefeicoesDia> {
        const ficha = await this.exigirFicha(usuarioId);

        const agora = new Date();
        const removidos = await this.refeicaoRepository.remover(
            usuarioId,
            refeicaoId,
            janelaDoDia(agora),
        );

        // Zero linhas cobre "não estava marcada" e "é de outro usuário" — o
        // repository filtra por dono. Os dois viram 404: um 403 confirmaria a
        // existência do registro alheio.
        if (removidos === 0) {
            throw new NaoEncontradoError("Refeição não está marcada hoje");
        }

        return this.montarDia(usuarioId, agora, ficha);
    }

    /**
     * Histórico bruto de um intervalo. Nenhuma rota consome ainda — é a base do
     * gráfico de aderência à dieta ao longo do tempo.
     */
    historico(usuarioId: string, periodo: Periodo): Promise<RegistroRefeicaoComPrescricao[]> {
        return this.refeicaoRepository.listarPorPeriodo(usuarioId, periodo);
    }

    /** A ficha ativa, ou 404 — os três métodos públicos falham do mesmo jeito. */
    private async exigirFicha(usuarioId: string): Promise<FichaAtiva> {
        const ficha = await this.planRepository.buscarFichaAlimentacaoAtiva(usuarioId);

        if (!ficha) {
            throw new NaoEncontradoError("Usuário não encontrado ou sem plano ativo");
        }

        return ficha;
    }

    /**
     * Recorta o dia no fuso do usuário e soma os macros do que foi marcado.
     *
     * A soma sai do JOIN com a prescrição, não da ficha ativa: uma refeição
     * marcada antes de o usuário gerar um plano novo continua contando com os
     * macros da ficha em que foi prescrita.
     */
    private async montarDia(
        usuarioId: string,
        instante: Date,
        ficha: FichaAtiva,
    ): Promise<ResumoRefeicoesDia> {
        const registros = await this.refeicaoRepository.listarPorPeriodo(
            usuarioId,
            janelaDoDia(instante),
        );

        const consumido = registros.reduce<Macros>(
            (total, { refeicao }) => ({
                kcal: total.kcal + refeicao.kcal,
                proteinaG: total.proteinaG + refeicao.proteinaG,
                carboidratoG: total.carboidratoG + refeicao.carboidratoG,
                gorduraG: total.gorduraG + refeicao.gorduraG,
            }),
            { kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0 },
        );

        return {
            dia: diaISO(instante),
            registros,
            consumido,
            metas: {
                kcal: ficha.caloriasAlvo,
                proteinaG: ficha.proteinaG,
                carboidratoG: ficha.carboidratoG,
                gorduraG: ficha.gorduraG,
            },
            totalRefeicoes: ficha.refeicoes.length,
        };
    }
}
