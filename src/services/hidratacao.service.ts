import { diaISO, janelaDoDia } from "../config/fuso";
import NaoEncontradoError from "../errors/nao-encontrado.error";
import ValidationError from "../errors/validation.error";
import PlanRepository from "../repositories/plan.repository";
import {
    Periodo,
    RegistroHidratacao,
    ResumoHidratacaoDia,
} from "../types/registro.types";

/**
 * Domínio da hidratação: registrar o que foi bebido, consultar o dia e
 * desfazer um registro errado.
 *
 * A META já existia antes deste service: `FichaAlimentacao.metaAguaMl`, escrita
 * no cadastro. O que faltava — e é o que mora aqui — é o CONSUMO para comparar
 * com ela.
 *
 * A tabela é um log de eventos, então não há update: registrar insere uma
 * linha, desfazer apaga uma linha. Ver o comentário do model no schema.
 */
export interface HidratacaoRepository {
    criar(registro: Omit<RegistroHidratacao, "id">): Promise<RegistroHidratacao>;
    listarPorPeriodo(usuarioId: string, periodo: Periodo): Promise<RegistroHidratacao[]>;
    /** Devolve quantas linhas saíram: 0 significa inexistente OU de outro dono. */
    remover(usuarioId: string, registroId: string): Promise<number>;
}

/**
 * Teto por registro. Não é regra fisiológica — é barreira contra dedo gordo e
 * contra payload absurdo: 5 litros de uma vez não é um copo d'água.
 */
const VOLUME_MAXIMO_ML = 5000;

export default class HidratacaoService {
    private readonly hidratacaoRepository;
    private readonly planRepository;

    constructor(hidratacaoRepository: HidratacaoRepository, planRepository: PlanRepository) {
        this.hidratacaoRepository = hidratacaoRepository;
        this.planRepository = planRepository;
    }

    /** Registra um copo/garrafa de água e devolve o dia já atualizado. */
    async registrar(usuarioId: string, volumeMl: number): Promise<ResumoHidratacaoDia> {
        if (!Number.isInteger(volumeMl) || volumeMl <= 0 || volumeMl > VOLUME_MAXIMO_ML) {
            throw new ValidationError(
                `volumeMl deve ser um inteiro entre 1 e ${VOLUME_MAXIMO_ML}`,
            );
        }

        // A meta é buscada ANTES de inserir: ela é obrigatória na resposta e,
        // de quebra, sua ausência já identifica usuário inexistente ou sem
        // ficha. Sem isso o insert estouraria a chave estrangeira do Prisma, e
        // um usuarioId inválido viraria 500 em vez de 404.
        const metaMl = await this.exigirMeta(usuarioId);

        await this.hidratacaoRepository.criar({
            usuarioId,
            volumeMl,
            registradoEm: new Date(),
        });

        return this.montarDia(usuarioId, new Date(), metaMl);
    }

    /** O consumo de um dia com a meta — é o card de hidratação da Home. */
    async doDia(usuarioId: string, dia: Date): Promise<ResumoHidratacaoDia> {
        const metaMl = await this.exigirMeta(usuarioId);

        return this.montarDia(usuarioId, dia, metaMl);
    }

    /** Desfaz um registro e devolve o dia já atualizado. */
    async remover(usuarioId: string, registroId: string): Promise<ResumoHidratacaoDia> {
        const metaMl = await this.exigirMeta(usuarioId);

        const removidos = await this.hidratacaoRepository.remover(usuarioId, registroId);

        // O repository filtra por id e dono na mesma query, então zero linhas
        // pode ser "não existe" ou "é de outro usuário". Os dois viram 404: um
        // 403 confirmaria a existência do registro alheio.
        if (removidos === 0) {
            throw new NaoEncontradoError("Registro de hidratação não encontrado");
        }

        return this.montarDia(usuarioId, new Date(), metaMl);
    }

    /**
     * Histórico bruto de um intervalo. Nenhuma rota consome ainda — é a base
     * do gráfico de hidratação ao longo do tempo.
     */
    historico(usuarioId: string, periodo: Periodo): Promise<RegistroHidratacao[]> {
        return this.hidratacaoRepository.listarPorPeriodo(usuarioId, periodo);
    }

    /**
     * A meta da ficha ativa, ou 404. Concentrada num lugar só porque os três
     * métodos públicos precisam dela e todos devem falhar do mesmo jeito.
     */
    private async exigirMeta(usuarioId: string): Promise<number> {
        const metaMl = await this.planRepository.buscarMetaAgua(usuarioId);

        if (metaMl === null) {
            throw new NaoEncontradoError("Usuário não encontrado ou sem plano ativo");
        }

        return metaMl;
    }

    /** Recorta o dia no fuso do usuário e soma o que caiu dentro dele. */
    private async montarDia(
        usuarioId: string,
        instante: Date,
        metaMl: number,
    ): Promise<ResumoHidratacaoDia> {
        const registros = await this.hidratacaoRepository.listarPorPeriodo(
            usuarioId,
            janelaDoDia(instante),
        );

        return {
            dia: diaISO(instante),
            totalMl: registros.reduce((total, registro) => total + registro.volumeMl, 0),
            metaMl,
            registros,
        };
    }
}
