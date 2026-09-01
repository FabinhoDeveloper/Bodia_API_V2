import NaoEncontradoError from "../../src/errors/nao-encontrado.error";
import ValidationError from "../../src/errors/validation.error";
import PlanoIaGenerator from "../../src/generators/plano-ia.generator";
import ConferenciaMapper from "../../src/mappers/conferencia.mapper";
import MeuPlanoMapper from "../../src/mappers/meu-plano.mapper";
import PerfilMapper from "../../src/mappers/perfil.mapper";
import PlanoMapper from "../../src/mappers/plano.mapper";
import PesoRepository from "../../src/repositories/peso.repository";
import PlanRepository from "../../src/repositories/plan.repository";
import EngineService from "../../src/services/engine.service";
import PlanService from "../../src/services/plan.service";
import { OnboardingRequest, PlanoValidado } from "../../src/types/plano.types";

function cadastroBase(overrides: Partial<OnboardingRequest> = {}): OnboardingRequest {
    return {
        conta: {
            nome: "Ana",
            sobrenome: "Silva",
            email: "a@b.com",
            senha: "12345678",
            aceiteTermos: true,
        },
        perfil: {
            sexo: "F",
            dataNascimento: "1998-04-10",
            peso: 65,
            altura: 165,
            percentualGordura: 20,
            nivelAtividade: "moderado",
            nivelExperiencia: "iniciante",
            objetivo: "perder",
            diasPorSemana: 4,
            numeroRefeicoes: 4,
            restricoesAlimentares: ["Lactose"],
            restricoesFisicas: [],
        },
        ...overrides,
    };
}

const PLANO_FAKE: PlanoValidado = {
    plano: {
        dieta: {
            refeicoes: [
                { nome: "Almoço", itens: [{ alimentoId: 3, nome: "Arroz, tipo 1, cozido", gramas: 150 }] },
            ],
        },
        treino: {
            sessoes: [
                {
                    nome: "Upper",
                    exercicios: [
                        { exercicioId: 1, nome: "Supino reto com barra", series: 4, repeticoes: "8-10" },
                    ],
                },
            ],
        },
    },
    validacao: {
        calorias: { meta: 1711, obtido: 1700, desvioPercentual: -0.6 },
        proteina: { meta: 140, obtido: 139, desvioPercentual: -0.7 },
        carboidrato: { meta: 181, obtido: 180, desvioPercentual: -0.6 },
        gordura: { meta: 48, obtido: 48, desvioPercentual: 0 },
        dentroDoLimite: true,
    },
    // O treino do fake não tem orçamento a conferir.
    validacaoVolume: { sessoes: [], dentroDoLimite: true },
};

// A IA nunca é chamada de verdade nos testes: gastaria crédito e deixaria a suíte
// dependente de rede.
function planoServiceFake(gerar = jest.fn().mockResolvedValue(PLANO_FAKE)) {
    return { gerar } as unknown as PlanoIaGenerator & { gerar: jest.Mock };
}

/**
 * Todos os métodos como jest.Mock.
 *
 * O tipo é mapeado, e não uma interseção com `Record<string, jest.Mock>`: numa
 * interseção o método concreto vence a assinatura de índice, e `.mockResolvedValue`
 * some.
 */
type PlanRepositoryFake = { [K in keyof PlanRepository]: jest.Mock };
type PesoRepositoryFake = { [K in keyof PesoRepository]: jest.Mock };

function repositoryFake(retorno: unknown) {
    return {
        buscarPlanoAtivo: jest.fn().mockResolvedValue(retorno),
        buscarRestricoes: jest
            .fn()
            .mockResolvedValue({ restricoesAlimentares: [], restricoesFisicas: [] }),
        substituirFichas: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlanRepositoryFake;
}

/** O usuário como o banco o guarda — só o que o motor consome. */
function pesoRepositoryFake(pesoKg: number | null = 65) {
    return {
        buscarPerfil: jest.fn().mockResolvedValue({
            sexo: "F",
            dataNascimento: new Date("1998-04-10T00:00:00.000Z"),
            alturaCm: 165,
            percentualGordura: 20,
            nivelAtividade: "MODERADO",
            nivelExperiencia: "INICIANTE",
            objetivo: "PERDER",
            diasPorSemana: 4,
            numeroRefeicoes: 4,
            pesos: pesoKg === null ? [] : [{ pesoKg }],
        }),
    } as unknown as PesoRepositoryFake;
}

/** PlanService montado para exercitar `gerar` — a leitura não é usada aqui. */
function servicoDeGeracao(gerador = planoServiceFake()) {
    return new PlanService(
        new EngineService(),
        gerador,
        new PlanoMapper(),
        repositoryFake(null) as unknown as PlanRepository,
        new MeuPlanoMapper(),
        pesoRepositoryFake() as unknown as PesoRepository,
        new PerfilMapper(),
        new ConferenciaMapper(),
    );
}

/** PlanService montado para exercitar `consultar` — a geração não é usada aqui. */
function servicoDeConsulta(retorno: unknown, pesoRepository = pesoRepositoryFake()) {
    const repository = repositoryFake(retorno);
    const gerador = planoServiceFake();

    return {
        repository,
        gerador,
        pesoRepository,
        service: new PlanService(
            new EngineService(),
            gerador,
            new PlanoMapper(),
            repository as unknown as PlanRepository,
            new MeuPlanoMapper(),
            pesoRepository as unknown as PesoRepository,
            new PerfilMapper(),
            new ConferenciaMapper(),
        ),
    };
}

describe("PlanService", () => {
    const engineService = new EngineService();

    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    // A resposta agora carrega o plano: é dela que a PlanoResumoScreen se
    // alimenta, em vez dos mocks que o app tinha embutidos.
    it("devolve o plano no formato que o app consome", async () => {
        const planService = servicoDeGeracao();
        const cadastro = cadastroBase();

        const { plano } = await planService.gerar(cadastro);
        const esperado = engineService.calcular(cadastro.perfil!);

        expect(plano.metas.calorias).toBe(esperado.meta.caloriasAlvo);
        expect(plano.metas.proteinaG).toBe(esperado.macros.proteina.g);
        expect(plano.treino.split).toBe(esperado.treino.split);
        expect(plano.dieta.refeicoes[0].horario).toBeTruthy();
        expect(plano.treino.sessoes[0].gruposMusculares).toBeTruthy();
    });

    it("registra no console o plano calculado, não o payload recebido", async () => {
        const planService = servicoDeGeracao();
        const cadastro = cadastroBase();

        await planService.gerar(cadastro);

        const [rotulo, corpo] = logSpy.mock.calls[0];
        expect(rotulo).toBe("[onboarding] plano calculado:");
        expect(JSON.parse(corpo)).toEqual(engineService.calcular(cadastro.perfil!));
    });

    it("não expõe dados da conta no log", async () => {
        const planService = servicoDeGeracao();

        await planService.gerar(cadastroBase());

        const tudoQueFoiLogado = logSpy.mock.calls.flat().join(" ");
        expect(tudoQueFoiLogado).not.toContain("12345678");
        expect(tudoQueFoiLogado).not.toContain("a@b.com");
    });

    it("gera o plano com a IA e registra o plano e a conferência dos macros", async () => {
        const planoIaGenerator = planoServiceFake();
        const planService = servicoDeGeracao(planoIaGenerator);
        const cadastro = cadastroBase();

        await planService.gerar(cadastro);

        expect(planoIaGenerator.gerar).toHaveBeenCalledWith(
            cadastro.perfil,
            engineService.calcular(cadastro.perfil!),
        );
        expect(logSpy.mock.calls[1][0]).toBe("[onboarding] conferência dos macros:");
        expect(logSpy.mock.calls[2][0]).toBe("[onboarding] plano enviado ao app:");
    });

    it("propaga a falha da IA em vez de engolir o erro", async () => {
        const planoIaGenerator = planoServiceFake(jest.fn().mockRejectedValue(new Error("401 Unauthorized")));
        const planService = servicoDeGeracao(planoIaGenerator);

        await expect(planService.gerar(cadastroBase())).rejects.toThrow(
            "401 Unauthorized",
        );
    });

    it("rejeita cadastro sem perfil (não há como calcular o plano)", async () => {
        const planoIaGenerator = planoServiceFake();
        const planService = servicoDeGeracao(planoIaGenerator);
        const cadastro = cadastroBase({ perfil: null });

        await expect(planService.gerar(cadastro)).rejects.toThrow(ValidationError);
        await expect(planService.gerar(cadastro)).rejects.toThrow(
            "perfil é obrigatório para gerar o plano",
        );
        expect(planoIaGenerator.gerar).not.toHaveBeenCalled();
    });

    it("propaga como ValidationError o erro de validação do EngineService", async () => {
        const planoIaGenerator = planoServiceFake();
        const planService = servicoDeGeracao(planoIaGenerator);
        const cadastro = cadastroBase();
        cadastro.perfil!.diasPorSemana = 9;

        await expect(planService.gerar(cadastro)).rejects.toThrow(ValidationError);
        await expect(planService.gerar(cadastro)).rejects.toThrow(
            "diasPorSemana deve ser um inteiro entre 2 e 6",
        );
        expect(planoIaGenerator.gerar).not.toHaveBeenCalled();
    });
});

// Vinha de PlanoConsultaService, absorvido por PlanService.consultar — o
// shaping em si agora mora em MeuPlanoMapper, mas o comportamento observável
// é o mesmo e continua sendo verificado pela porta do service.
function usuarioNoBanco(overrides: Record<string, unknown> = {}) {
    return {
        nome: "Ana",
        sobrenome: "Silva",
        email: "ana@teste.com",
        alturaCm: 165,
        objetivo: "PERDER",
        // Vem ordenado desc e limitado a 1 pelo repository: o peso atual.
        pesos: [{ pesoKg: 64 }],
        // A carga de cada exercício vive fora da ficha (CargaExercicio),
        // indexada pelo id do CATÁLOGO — não pelo id do ExercicioSessao.
        cargas: [{ exercicioId: 17, pesoKg: 40 }],
        fichasTreino: [
            {
                split: "Upper / Lower",
                diasPorSemana: 4,
                sessoes: [
                    {
                        id: "s1",
                        nome: "Upper",
                        diaSemana: "Segunda",
                        exercicios: [
                            {
                                id: "e1",
                                exercicioId: 1,
                                series: 3,
                                repeticoes: "8-12",
                                descansoSegundos: 90,
                                exercicio: {
                                    nome: "Supino reto com barra",
                                    grupoMuscular: "Peito",
                                },
                            },
                            {
                                id: "e2",
                                exercicioId: 17,
                                series: 3,
                                repeticoes: "8-12",
                                descansoSegundos: 90,
                                exercicio: {
                                    nome: "Puxada frente na polia",
                                    grupoMuscular: "Costas",
                                },
                            },
                            {
                                id: "e3",
                                exercicioId: 20,
                                series: 3,
                                repeticoes: "8-12",
                                descansoSegundos: 90,
                                // Mesmo grupo do anterior: não pode duplicar no resumo.
                                exercicio: { nome: "Remada curvada", grupoMuscular: "Costas" },
                            },
                        ],
                    },
                ],
            },
        ],
        fichasAlimentacao: [
            {
                caloriasAlvo: 1711,
                proteinaG: 140,
                carboidratoG: 181,
                gorduraG: 48,
                metaAguaMl: 2000,
                refeicoes: [
                    {
                        id: "r1",
                        nome: "Almoço",
                        horario: "12:30",
                        kcal: 599,
                        proteinaG: 49,
                        carboidratoG: 63,
                        gorduraG: 17,
                        itens: [
                            {
                                alimentoId: 3,
                                gramas: 150,
                                alimento: { nome: "Arroz, tipo 1, cozido", kcal: 128.26 },
                            },
                        ],
                    },
                ],
            },
        ],
        ...overrides,
    };
}

describe("PlanService.consultar", () => {
    it("usa o registro mais recente como peso atual", async () => {
        const { service } = servicoDeConsulta(usuarioNoBanco());

        const plano = await service.consultar("usuario-1");

        expect(plano.usuario.pesoAtualKg).toBe(64);
        expect(plano.usuario.nome).toBe("Ana");
    });

    it("traz nome e grupo muscular do catálogo, não da ficha", async () => {
        const { service } = servicoDeConsulta(usuarioNoBanco());

        const exercicio = (await service.consultar("usuario-1")).treino.sessoes[0].exercicios[0];

        expect(exercicio.nome).toBe("Supino reto com barra");
        expect(exercicio.grupoMuscular).toBe("Peito");
        expect(exercicio.ultimoPesoKg).toBeNull();
    });

    // A carga é casada pelo id do CATÁLOGO, não pelo do ExercicioSessao — é o
    // que a faz sobreviver a um plano novo, que cria outra ficha com outros
    // ExercicioSessao apontando para os mesmos exercícios.
    it("traz a carga de CargaExercicio, casada pelo id do catálogo", async () => {
        const { service } = servicoDeConsulta(usuarioNoBanco());

        const exercicios = (await service.consultar("usuario-1")).treino.sessoes[0].exercicios;

        expect(exercicios.find((e) => e.exercicioId === 17)?.ultimoPesoKg).toBe(40);
        expect(exercicios.find((e) => e.exercicioId === 1)?.ultimoPesoKg).toBeNull();
    });

    // O resumo é o subtítulo do card: repetir "Costas" duas vezes ficaria feio.
    it("resume os grupos musculares da sessão sem repetir", async () => {
        const { service } = servicoDeConsulta(usuarioNoBanco());

        expect((await service.consultar("usuario-1")).treino.sessoes[0].gruposMusculares).toBe(
            "Peito, Costas",
        );
    });

    it("calcula as kcal do item pela TACO e pelas gramas", async () => {
        const { service } = servicoDeConsulta(usuarioNoBanco());

        // 128.26 kcal/100g × 150g = 192
        expect((await service.consultar("usuario-1")).dieta.refeicoes[0].itens[0].kcal).toBe(192);
    });

    it("devolve as metas da ficha de alimentação", async () => {
        const { service } = servicoDeConsulta(usuarioNoBanco());

        expect((await service.consultar("usuario-1")).dieta.metas).toEqual({
            calorias: 1711,
            proteinaG: 140,
            carboidratoG: 181,
            gorduraG: 48,
            aguaMl: 2000,
        });
    });

    it.each([
        ["usuário inexistente", null],
        ["usuário sem ficha de treino ativa", usuarioNoBanco({ fichasTreino: [] })],
        ["usuário sem ficha de alimentação ativa", usuarioNoBanco({ fichasAlimentacao: [] })],
    ])("recusa %s", async (_caso, retorno) => {
        const { service } = servicoDeConsulta(retorno);

        await expect(service.consultar("usuario-1")).rejects.toThrow(NaoEncontradoError);
    });

    it("tolera usuário sem nenhum registro de peso", async () => {
        const { service } = servicoDeConsulta(usuarioNoBanco({ pesos: [] }));

        expect((await service.consultar("usuario-1")).usuario.pesoAtualKg).toBeNull();
    });
});
// RF20. A diferença para `gerar` é que aqui o usuário já existe: o perfil vem
// do BANCO e o plano é gravado na hora, sem tela de aprovação.
describe("PlanService.regenerar", () => {
    const USUARIO_COM_PLANO = usuarioNoBanco();

    it("monta o perfil a partir do banco, e não de um payload", async () => {
        const { service, gerador, pesoRepository } = servicoDeConsulta(USUARIO_COM_PLANO);

        await service.regenerar("usuario-1");

        expect(pesoRepository.buscarPerfil).toHaveBeenCalledWith("usuario-1");
        const [perfilUsado] = gerador.gerar.mock.calls[0];
        expect(perfilUsado).toMatchObject({ sexo: "F", altura: 165, objetivo: "perder" });
    });

    // Sem elas, regenerar devolveria frango a um vegano: é o único pedaço do
    // perfil que não está na tabela Usuario.
    it("leva as restrições declaradas para o gerador", async () => {
        const { service, repository, gerador } = servicoDeConsulta(USUARIO_COM_PLANO);
        repository.buscarRestricoes.mockResolvedValue({
            restricoesAlimentares: ["Lactose"],
            restricoesFisicas: ["Joelho"],
        });

        await service.regenerar("usuario-1");

        const [perfilUsado] = gerador.gerar.mock.calls[0];
        expect(perfilUsado).toMatchObject({
            restricoesAlimentares: ["Lactose"],
            restricoesFisicas: ["Joelho"],
        });
    });

    it("substitui as fichas em vez de criar ficha nova solta", async () => {
        const { service, repository } = servicoDeConsulta(USUARIO_COM_PLANO);

        await service.regenerar("usuario-1");

        expect(repository.substituirFichas).toHaveBeenCalledWith(
            "usuario-1",
            expect.objectContaining({ metas: expect.any(Object) }),
            expect.objectContaining({ metabolismo: expect.any(Object) }),
        );
    });

    // Sem os ids do banco a tela abriria e nada seria clicável: o app precisa
    // deles para marcar refeição e abrir treino.
    it("devolve o plano lido do banco, com os ids das telas", async () => {
        const { service } = servicoDeConsulta(USUARIO_COM_PLANO);

        const plano = await service.regenerar("usuario-1");

        expect(plano.treino.sessoes[0].id).toBe("s1");
        expect(plano.dieta.refeicoes[0].id).toBe("r1");
    });

    it("recusa usuário sem peso registrado", async () => {
        const { service, repository } = servicoDeConsulta(
            USUARIO_COM_PLANO,
            pesoRepositoryFake(null),
        );

        await expect(service.regenerar("usuario-1")).rejects.toThrow(NaoEncontradoError);
        expect(repository.substituirFichas).not.toHaveBeenCalled();
    });
});
