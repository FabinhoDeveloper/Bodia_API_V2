import { Periodo, RegistroHidratacao } from "../types/registro.types";

/**
 * ESQUELETO — nenhum método funciona ainda, e nenhuma rota aponta para cá.
 *
 * Falta antes: o model `RegistroHidratacao` em prisma/schema.prisma
 * (usuarioId, volumeMl, registradoEm) e a migration correspondente.
 *
 * A META diária já existe: `FichaAlimentacao.metaAguaMl`, gravada no cadastro
 * e devolvida por PlanService.consultar em `dieta.metas.aguaMl`. O que falta é
 * o consumo registrado para comparar com ela.
 */
export interface HidratacaoRepository {
    criar(registro: Omit<RegistroHidratacao, "id">): Promise<RegistroHidratacao>;
    listarPorPeriodo(usuarioId: string, periodo: Periodo): Promise<RegistroHidratacao[]>;
}

const NAO_IMPLEMENTADO =
    "hidratacao.service: não implementado — falta o model RegistroHidratacao";

export default class HidratacaoService {
    private readonly hidratacaoRepository;

    constructor(hidratacaoRepository: HidratacaoRepository) {
        this.hidratacaoRepository = hidratacaoRepository;
    }

    /** Registra um copo/garrafa de água. */
    async registrar(_usuarioId: string, _volumeMl: number): Promise<RegistroHidratacao> {
        throw new Error(NAO_IMPLEMENTADO);
    }

    async historico(_usuarioId: string, _periodo: Periodo): Promise<RegistroHidratacao[]> {
        throw new Error(NAO_IMPLEMENTADO);
    }

    /** Total do dia mais a meta — é o anel de água da Home. */
    async doDia(
        _usuarioId: string,
        _dia: Date,
    ): Promise<{ totalMl: number; metaMl: number; registros: RegistroHidratacao[] }> {
        throw new Error(NAO_IMPLEMENTADO);
    }
}
