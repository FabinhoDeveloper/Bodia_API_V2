import { diaISO, janelaDaSemana } from "../config/fuso";
import NaoEncontradoError from "../errors/nao-encontrado.error";
import ValidationError from "../errors/validation.error";
import TreinoRepository from "../repositories/treino.repository";
import {
    Periodo,
    RegistroTreino,
    ResumoTreinosPeriodo,
    SerieExecutada,
    TreinoConcluido,
} from "../types/registro.types";

/**
 * Domínio do treino executado: abrir uma sessão, concluí-la com as séries
 * feitas e consultar o que já foi feito (RF25 e RF27).
 *
 * A PRESCRIÇÃO já existia — SessaoTreino e ExercicioSessao, dentro da
 * FichaTreino. O que mora aqui é o REGISTRO: quanto peso, quantas repetições,
 * em que série. Prescrição e execução nunca se misturam; a segunda aponta para
 * a primeira por FK e nada é copiado.
 *
 * Percorreu o mesmo caminho que hidratação e refeição já haviam percorrido —
 * model, migration, repository, service, controller, rota — e reusa
 * `config/fuso.ts` para o recorte, em vez de reimplementar a janela.
 *
 * A diferença é o PERÍODO: água e refeição são do DIA, treino é da SEMANA. A
 * prescrição é semanal e a tela mostra um card por dia da semana, então a
 * pergunta que o app faz é "o que já fiz nesta semana".
 */
export default class TreinoService {
    /**
     * Teto de séries por requisição. Não é regra de treino — é o que impede um
     * payload absurdo virar dezenas de milhares de linhas no banco. Um treino
     * real fica bem abaixo: 7 exercícios × 5 séries = 35.
     */
    private static readonly MAX_SERIES = 200;

    private readonly treinoRepository;

    constructor(treinoRepository: TreinoRepository) {
        this.treinoRepository = treinoRepository;
    }

    /**
     * Abre um treino a partir de uma sessão prescrita.
     *
     * IDEMPOTENTE, como o `POST /api/refeicao`: se já existe um treino aberto
     * desta sessão, devolve aquele em vez de criar outro. Sem isso, sair da tela
     * da série e voltar deixaria um rastro de treinos abertos que nunca fecham —
     * e o `concluir` fecharia o errado.
     */
    async abrir(usuarioId: string, sessaoTreinoId: string): Promise<RegistroTreino> {
        if (!sessaoTreinoId) {
            throw new ValidationError("sessaoTreinoId é obrigatório");
        }

        // Conferência de posse: sem ela daria para abrir um treino sobre a ficha
        // de outra pessoa. Mesma natureza da conferência do refeicaoId.
        const exercicios = await this.treinoRepository.buscarExerciciosDaSessao(
            usuarioId,
            sessaoTreinoId,
        );

        if (!exercicios) {
            throw new NaoEncontradoError("Sessão não encontrada no plano do usuário");
        }

        const aberto = await this.treinoRepository.buscarAberto(usuarioId, sessaoTreinoId);

        return aberto ?? this.treinoRepository.abrir(usuarioId, sessaoTreinoId);
    }

    /**
     * Fecha o treino com as séries executadas e devolve a semana já atualizada.
     *
     * Devolver a semana inteira, e não só o treino fechado, é a mesma decisão de
     * hidratação e refeição: a tela nunca precisa de um GET depois de um toque.
     *
     * De quebra, grava a carga de cada exercício em CargaExercicio — é o valor
     * que o app pré-preenche na próxima série. Ela é gravada DEPOIS de o treino
     * fechar: se a transação do treino falhar, a carga não avança sozinha.
     */
    async concluir(
        usuarioId: string,
        registroTreinoId: string,
        series: SerieExecutada[],
    ): Promise<ResumoTreinosPeriodo> {
        const treino = await this.treinoRepository.buscarPorId(usuarioId, registroTreinoId);

        // Treino inexistente e treino de outra pessoa dão o mesmo 404 — um 403
        // confirmaria a existência do treino alheio.
        if (!treino) {
            throw new NaoEncontradoError("Treino não encontrado");
        }

        const exercicios = await this.treinoRepository.buscarExerciciosDaSessao(
            usuarioId,
            treino.sessaoTreinoId,
        );

        if (!exercicios) {
            throw new NaoEncontradoError("Sessão não encontrada no plano do usuário");
        }

        const validas = this.validarSeries(series, new Set(exercicios.map((e) => e.id)));

        await this.treinoRepository.concluir(registroTreinoId, validas);
        await this.treinoRepository.registrarCargas(
            usuarioId,
            this.cargasPorExercicio(validas, exercicios),
        );

        return this.montarPeriodo(usuarioId, janelaDaSemana(new Date()));
    }

    /**
     * Os treinos concluídos de um período — a semana corrente por padrão.
     *
     * É a mesma consulta para os dois usos: marcar os cards da semana (RF25) e
     * listar o histórico de um intervalo maior (RF27). Duas rotas para a mesma
     * pergunta se separariam na primeira mudança de formato.
     */
    consultar(usuarioId: string, periodo: Periodo): Promise<ResumoTreinosPeriodo> {
        return this.montarPeriodo(usuarioId, periodo);
    }

    /**
     * Recusa a série malformada antes de gravar, e descarta a que aponta para um
     * exercício que não é desta sessão.
     *
     * O id fora da sessão é o análogo do alimentoId fora do catálogo na
     * validação do plano: um cliente adulterado poderia pendurar séries na ficha
     * de outra pessoa se o `exercicioSessaoId` não fosse conferido.
     */
    private validarSeries(series: SerieExecutada[], daSessao: Set<string>): SerieExecutada[] {
        if (!Array.isArray(series) || series.length === 0) {
            throw new ValidationError("series é obrigatório e não pode ser vazio");
        }

        if (series.length > TreinoService.MAX_SERIES) {
            throw new ValidationError(
                `series não pode ter mais de ${TreinoService.MAX_SERIES} itens`,
            );
        }

        return series.map((serie) => {
            if (!daSessao.has(serie.exercicioSessaoId)) {
                throw new NaoEncontradoError("Exercício não encontrado na sessão do usuário");
            }

            if (!Number.isInteger(serie.ordem) || serie.ordem < 0) {
                throw new ValidationError("ordem da série deve ser um inteiro não negativo");
            }

            if (!Number.isInteger(serie.repeticoes) || serie.repeticoes <= 0) {
                throw new ValidationError("repeticoes deve ser um inteiro positivo");
            }

            // Nulo é legítimo: exercício de peso corporal não tem carga. O que
            // não pode é número inválido disfarçado de peso.
            const pesoKg = serie.pesoKg ?? null;

            if (pesoKg !== null && (!Number.isFinite(pesoKg) || pesoKg < 0)) {
                throw new ValidationError("pesoKg deve ser um número não negativo");
            }

            return {
                exercicioSessaoId: serie.exercicioSessaoId,
                ordem: serie.ordem,
                repeticoes: serie.repeticoes,
                pesoKg,
            };
        });
    }

    /**
     * A carga de cada exercício do CATÁLOGO neste treino — o maior peso usado.
     *
     * O maior, e não o da última série: quem faz três séries de 60 kg e cai para
     * 40 na quarta não regrediu, cansou. Pré-preencher com 40 sugeriria começar
     * mais leve da próxima vez.
     *
     * Série sem carga não entra: um exercício de peso corporal registraria 0 kg
     * e o app o mostraria como se o usuário tivesse levantado nada.
     */
    private cargasPorExercicio(
        series: SerieExecutada[],
        exercicios: { id: string; exercicioId: number }[],
    ): { exercicioId: number; pesoKg: number }[] {
        const doCatalogo = new Map(exercicios.map((e) => [e.id, e.exercicioId]));
        const maiorPeso = new Map<number, number>();

        for (const serie of series) {
            if (serie.pesoKg == null || serie.pesoKg <= 0) continue;

            const exercicioId = doCatalogo.get(serie.exercicioSessaoId);
            if (exercicioId === undefined) continue;

            maiorPeso.set(exercicioId, Math.max(maiorPeso.get(exercicioId) ?? 0, serie.pesoKg));
        }

        return [...maiorPeso].map(([exercicioId, pesoKg]) => ({ exercicioId, pesoKg }));
    }

    /**
     * Lê o período e soma duração, séries e volume de cada treino.
     *
     * As somas saem daqui, e não do app, pela mesma razão que o `consumido` da
     * refeição: quem abre o histórico de uma semana atrás não tem em mãos as
     * séries daquele dia, e duas implementações da mesma soma divergem.
     */
    private async montarPeriodo(
        usuarioId: string,
        periodo: Periodo,
    ): Promise<ResumoTreinosPeriodo> {
        const registros = await this.treinoRepository.listarConcluidos(usuarioId, periodo);

        const treinos: TreinoConcluido[] = registros.map((registro) => {
            // Garantido não-nulo pelo filtro do repository; o `!` existe só
            // porque o tipo do Prisma não carrega essa informação.
            const concluidoEm = registro.concluidoEm!;

            return {
                id: registro.id,
                sessaoTreinoId: registro.sessaoTreinoId,
                sessaoNome: registro.sessaoTreino.nome,
                iniciadoEm: registro.iniciadoEm,
                concluidoEm,
                duracaoSegundos: Math.max(
                    Math.round(
                        (concluidoEm.getTime() - registro.iniciadoEm.getTime()) / 1000,
                    ),
                    0,
                ),
                totalSeries: registro.series.length,
                volumeKg: registro.series.reduce(
                    (total, serie) => total + (serie.pesoKg ?? 0) * serie.repeticoes,
                    0,
                ),
                series: registro.series.map((serie) => ({
                    exercicioSessaoId: serie.exercicioSessaoId,
                    ordem: serie.ordem,
                    repeticoes: serie.repeticoes,
                    pesoKg: serie.pesoKg,
                })),
            };
        });

        return {
            de: diaISO(periodo.de),
            // `periodo.ate` é EXCLUSIVO: um milissegundo antes cai no último dia
            // de fato coberto, que é o que o app exibe.
            ate: diaISO(new Date(periodo.ate.getTime() - 1)),
            treinos,
        };
    }
}
