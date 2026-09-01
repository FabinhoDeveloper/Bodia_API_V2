import NaoEncontradoError from "../../src/errors/nao-encontrado.error";
import ValidationError from "../../src/errors/validation.error";
import TreinoRepository from "../../src/repositories/treino.repository";
import TreinoService from "../../src/services/treino.service";
import { SerieExecutada } from "../../src/types/registro.types";

const INICIO = new Date("2026-08-19T13:00:00.000Z");
const FIM = new Date("2026-08-19T14:00:00.000Z");

// Os exercícios PRESCRITOS da sessão: o id do ExercicioSessao e o do catálogo.
const EXERCICIOS = [
    { id: "es-1", exercicioId: 1 },
    { id: "es-2", exercicioId: 17 },
];

function series(overrides: Partial<SerieExecutada>[] = []): SerieExecutada[] {
    const base: SerieExecutada[] = [
        { exercicioSessaoId: "es-1", ordem: 0, repeticoes: 10, pesoKg: 60 },
        { exercicioSessaoId: "es-1", ordem: 1, repeticoes: 8, pesoKg: 60 },
        { exercicioSessaoId: "es-2", ordem: 0, repeticoes: 12, pesoKg: 40 },
    ];

    return overrides.length ? overrides.map((o) => ({ ...base[0], ...o })) : base;
}

/**
 * Todos os métodos como jest.Mock.
 *
 * O tipo é mapeado, e não `TreinoRepository & Record<string, jest.Mock>`: numa
 * interseção o método concreto vence a assinatura de índice, e `.mockResolvedValue`
 * some.
 */
type TreinoRepositoryFake = { [K in keyof TreinoRepository]: jest.Mock };

// O banco nunca é tocado: repository falso, sem Postgres nem sujeira.
function repositoryFake(opcoes: { aberto?: boolean; sessaoDoUsuario?: boolean } = {}) {
    const { aberto = false, sessaoDoUsuario = true } = opcoes;

    return {
        buscarExerciciosDaSessao: jest
            .fn()
            .mockResolvedValue(sessaoDoUsuario ? EXERCICIOS : null),
        buscarAberto: jest
            .fn()
            .mockResolvedValue(
                aberto
                    ? {
                          id: "treino-aberto",
                          usuarioId: "u1",
                          sessaoTreinoId: "s1",
                          iniciadoEm: INICIO,
                          concluidoEm: null,
                      }
                    : null,
            ),
        abrir: jest.fn().mockResolvedValue({
            id: "treino-novo",
            usuarioId: "u1",
            sessaoTreinoId: "s1",
            iniciadoEm: INICIO,
            concluidoEm: null,
        }),
        buscarPorId: jest.fn().mockResolvedValue({
            id: "treino-1",
            usuarioId: "u1",
            sessaoTreinoId: "s1",
            iniciadoEm: INICIO,
            concluidoEm: null,
        }),
        concluir: jest.fn().mockResolvedValue(undefined),
        registrarCargas: jest.fn().mockResolvedValue(undefined),
        listarConcluidos: jest.fn().mockResolvedValue([
            {
                id: "treino-1",
                sessaoTreinoId: "s1",
                iniciadoEm: INICIO,
                concluidoEm: FIM,
                sessaoTreino: { nome: "Upper" },
                series: [
                    { exercicioSessaoId: "es-1", ordem: 0, repeticoes: 10, pesoKg: 60 },
                    { exercicioSessaoId: "es-1", ordem: 1, repeticoes: 8, pesoKg: 60 },
                    { exercicioSessaoId: "es-2", ordem: 0, repeticoes: 12, pesoKg: 40 },
                ],
            },
        ]),
    } as unknown as TreinoRepositoryFake;
}

function montar(opcoes?: { aberto?: boolean; sessaoDoUsuario?: boolean }) {
    const repository = repositoryFake(opcoes);

    return {
        repository,
        service: new TreinoService(repository as unknown as TreinoRepository),
    };
}

const SEMANA = {
    de: new Date("2026-08-17T03:00:00.000Z"),
    ate: new Date("2026-08-24T03:00:00.000Z"),
};

describe("TreinoService", () => {
    describe("abrir", () => {
        it("cria o treino quando não há nenhum em andamento", async () => {
            const { service, repository } = montar();

            const treino = await service.abrir("u1", "s1");

            expect(treino.id).toBe("treino-novo");
            expect(repository.abrir).toHaveBeenCalledWith("u1", "s1");
        });

        // Sair da tela da série e voltar não pode abrir outro treino: o primeiro
        // ficaria pendurado para sempre e o `concluir` fecharia o errado.
        it("devolve o treino já aberto em vez de criar outro", async () => {
            const { service, repository } = montar({ aberto: true });

            const treino = await service.abrir("u1", "s1");

            expect(treino.id).toBe("treino-aberto");
            expect(repository.abrir).not.toHaveBeenCalled();
        });

        it("recusa sessaoTreinoId ausente antes de consultar o banco", async () => {
            const { service, repository } = montar();

            await expect(service.abrir("u1", "")).rejects.toThrow(ValidationError);
            expect(repository.buscarExerciciosDaSessao).not.toHaveBeenCalled();
        });

        // Sem a conferência de posse daria para abrir um treino sobre a ficha de
        // outra pessoa — mesma natureza da conferência do refeicaoId.
        it("recusa sessão que não é do usuário", async () => {
            const { service, repository } = montar({ sessaoDoUsuario: false });

            await expect(service.abrir("u1", "s-alheia")).rejects.toThrow(NaoEncontradoError);
            expect(repository.abrir).not.toHaveBeenCalled();
        });
    });

    describe("concluir", () => {
        it("grava as séries e fecha o treino", async () => {
            const { service, repository } = montar();

            await service.concluir("u1", "treino-1", series());

            expect(repository.concluir).toHaveBeenCalledWith("treino-1", series());
        });

        it("devolve a semana já atualizada, sem exigir um GET depois", async () => {
            const { service } = montar();

            const resumo = await service.concluir("u1", "treino-1", series());

            expect(resumo.treinos).toHaveLength(1);
            expect(resumo.treinos[0].sessaoNome).toBe("Upper");
        });

        it("recusa treino que não é do usuário", async () => {
            const { service, repository } = montar();
            repository.buscarPorId.mockResolvedValue(null);

            await expect(service.concluir("u1", "treino-alheio", series())).rejects.toThrow(
                NaoEncontradoError,
            );
            expect(repository.concluir).not.toHaveBeenCalled();
        });

        // Um cliente adulterado penduraria séries na ficha de outra pessoa se o
        // exercicioSessaoId não fosse conferido contra a sessão.
        it("recusa série de exercício que não é da sessão", async () => {
            const { service, repository } = montar();

            await expect(
                service.concluir("u1", "treino-1", series([{ exercicioSessaoId: "es-alheio" }])),
            ).rejects.toThrow(NaoEncontradoError);
            expect(repository.concluir).not.toHaveBeenCalled();
        });

        it.each([
            ["lista vazia", []],
            ["repetições zero", series([{ repeticoes: 0 }])],
            ["repetições fracionárias", series([{ repeticoes: 8.5 }])],
            ["ordem negativa", series([{ ordem: -1 }])],
            ["peso negativo", series([{ pesoKg: -10 }])],
        ])("recusa %s sem gravar nada", async (_caso, invalidas) => {
            const { service, repository } = montar();

            await expect(
                service.concluir("u1", "treino-1", invalidas as SerieExecutada[]),
            ).rejects.toThrow(ValidationError);
            expect(repository.concluir).not.toHaveBeenCalled();
        });

        // Peso corporal não tem carga: recusar o nulo tornaria impossível
        // registrar uma barra fixa.
        it("aceita série sem carga", async () => {
            const { service, repository } = montar();

            await service.concluir("u1", "treino-1", series([{ pesoKg: null }]));

            expect(repository.concluir).toHaveBeenCalled();
        });

        describe("carga gravada para a próxima vez", () => {
            it("guarda o MAIOR peso do exercício, não o da última série", async () => {
                const { service, repository } = montar();

                await service.concluir("u1", "treino-1", [
                    { exercicioSessaoId: "es-1", ordem: 0, repeticoes: 10, pesoKg: 60 },
                    { exercicioSessaoId: "es-1", ordem: 1, repeticoes: 8, pesoKg: 60 },
                    // Caiu para 40 na última: cansaço, não regressão.
                    { exercicioSessaoId: "es-1", ordem: 2, repeticoes: 6, pesoKg: 40 },
                ]);

                expect(repository.registrarCargas).toHaveBeenCalledWith("u1", [
                    { exercicioId: 1, pesoKg: 60 },
                ]);
            });

            // Um exercício de peso corporal registraria 0 kg, e o app o mostraria
            // como se o usuário não tivesse levantado nada.
            it("ignora série sem carga", async () => {
                const { service, repository } = montar();

                await service.concluir("u1", "treino-1", [
                    { exercicioSessaoId: "es-1", ordem: 0, repeticoes: 10, pesoKg: null },
                    { exercicioSessaoId: "es-2", ordem: 0, repeticoes: 12, pesoKg: 40 },
                ]);

                expect(repository.registrarCargas).toHaveBeenCalledWith("u1", [
                    { exercicioId: 17, pesoKg: 40 },
                ]);
            });

            // A carga só avança se o treino tiver fechado de verdade.
            it("grava a carga DEPOIS de fechar o treino", async () => {
                const { service, repository } = montar();

                await service.concluir("u1", "treino-1", series());

                expect(repository.concluir.mock.invocationCallOrder[0]).toBeLessThan(
                    repository.registrarCargas.mock.invocationCallOrder[0],
                );
            });
        });
    });

    describe("consultar", () => {
        // Quem abre o histórico de uma semana atrás não tem as séries daquele
        // dia em mãos para refazer a conta — ela precisa vir pronta.
        it("soma duração, séries e volume no servidor", async () => {
            const { service } = montar();

            const [treino] = (await service.consultar("u1", SEMANA)).treinos;

            expect(treino.duracaoSegundos).toBe(3600);
            expect(treino.totalSeries).toBe(3);
            // 60×10 + 60×8 + 40×12 = 600 + 480 + 480
            expect(treino.volumeKg).toBe(1560);
        });

        // `Periodo.ate` é exclusivo; o `ate` da resposta é o último dia coberto.
        it("devolve o período com o fim inclusivo", async () => {
            const { service } = montar();

            const resumo = await service.consultar("u1", SEMANA);

            expect(resumo.de).toBe("2026-08-17");
            expect(resumo.ate).toBe("2026-08-23");
        });

        // Sem isso o app não teria como saber quais cards marcar.
        it("identifica a sessão prescrita de cada treino", async () => {
            const { service } = montar();

            const resumo = await service.consultar("u1", SEMANA);

            expect(new Set(resumo.treinos.map((t) => t.sessaoTreinoId))).toEqual(
                new Set(["s1"]),
            );
        });
    });
});
