import { Periodo, RegistroRefeicao } from "../types/registro.types";

/**
 * ESQUELETO — nenhum método funciona ainda, e nenhuma rota aponta para cá.
 *
 * Falta antes: o model `RegistroRefeicao` em prisma/schema.prisma (usuarioId,
 * refeicaoId FK para Refeicao, registradoEm) e a migration correspondente.
 * Só então nasce o RefeicaoRepository que implementa a interface abaixo.
 *
 * O que existe hoje: a PRESCRIÇÃO (model Refeicao, dentro de FichaAlimentacao)
 * já é gravada no cadastro e lida por PlanService.consultar. O que falta é o
 * REGISTRO — o usuário marcar que comeu. Isso ainda é estado local no app.
 */
export interface RefeicaoRepository {
    criar(registro: Omit<RegistroRefeicao, "id">): Promise<RegistroRefeicao>;
    listarPorPeriodo(usuarioId: string, periodo: Periodo): Promise<RegistroRefeicao[]>;
}

const NAO_IMPLEMENTADO = "refeicao.service: não implementado — falta o model RegistroRefeicao";

export default class RefeicaoService {
    private readonly refeicaoRepository;

    constructor(refeicaoRepository: RefeicaoRepository) {
        this.refeicaoRepository = refeicaoRepository;
    }

    /** Marca uma refeição prescrita como consumida. */
    async registrar(_usuarioId: string, _refeicaoId: string): Promise<RegistroRefeicao> {
        throw new Error(NAO_IMPLEMENTADO);
    }

    /** Histórico de refeições registradas num intervalo. */
    async historico(_usuarioId: string, _periodo: Periodo): Promise<RegistroRefeicao[]> {
        throw new Error(NAO_IMPLEMENTADO);
    }

    /** As refeições registradas hoje — é o que a tela de Dieta consome. */
    async doDia(_usuarioId: string, _dia: Date): Promise<RegistroRefeicao[]> {
        throw new Error(NAO_IMPLEMENTADO);
    }
}
