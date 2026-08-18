import { Periodo, RegistroExercicio, RegistroTreino } from "../types/registro.types";

/**
 * ESQUELETO — nenhum método funciona ainda, e nenhuma rota aponta para cá.
 *
 * Falta antes: os models `RegistroTreino` (usuarioId, sessaoTreinoId,
 * iniciadoEm, concluidoEm) e `RegistroExercicio` (registroTreinoId,
 * exercicioSessaoId, seriesFeitas, pesoKg) em prisma/schema.prisma, com a
 * migration.
 *
 * Já existe uma ponta disso no schema: `ExercicioSessao.ultimoPesoKg`, hoje
 * gravado como null no cadastro e devolvido por PlanService.consultar. Quando
 * o registro de exercício entrar, é ele que passa a alimentar esse campo — a
 * carga da última vez é o que o app mostra ao iniciar a série.
 */
export interface TreinoRepository {
    criarTreino(registro: Omit<RegistroTreino, "id">): Promise<RegistroTreino>;
    criarExercicio(registro: Omit<RegistroExercicio, "id">): Promise<RegistroExercicio>;
    listarPorPeriodo(usuarioId: string, periodo: Periodo): Promise<RegistroTreino[]>;
}

const NAO_IMPLEMENTADO = "treino.service: não implementado — falta o model RegistroTreino";

export default class TreinoService {
    private readonly treinoRepository;

    constructor(treinoRepository: TreinoRepository) {
        this.treinoRepository = treinoRepository;
    }

    /** Abre um treino a partir de uma sessão prescrita. */
    async registrarTreino(_usuarioId: string, _sessaoTreinoId: string): Promise<RegistroTreino> {
        throw new Error(NAO_IMPLEMENTADO);
    }

    /** Registra séries e carga de um exercício dentro de um treino em andamento. */
    async registrarExercicio(
        _registroTreinoId: string,
        _exercicioSessaoId: string,
        _seriesFeitas: number,
        _pesoKg: number | null,
    ): Promise<RegistroExercicio> {
        throw new Error(NAO_IMPLEMENTADO);
    }

    async historico(_usuarioId: string, _periodo: Periodo): Promise<RegistroTreino[]> {
        throw new Error(NAO_IMPLEMENTADO);
    }
}
