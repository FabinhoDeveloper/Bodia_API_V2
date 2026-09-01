import bcrypt from "bcrypt";

import { lerToken } from "../../src/config/jwt";
import AutenticacaoError from "../../src/errors/autenticacao.error";
import ConflitoError from "../../src/errors/conflito.error";
import PerfilMapper from "../../src/mappers/perfil.mapper";
import PesoRepository from "../../src/repositories/peso.repository";
import PlanRepository from "../../src/repositories/plan.repository";
import ValidationError from "../../src/errors/validation.error";
import UserRepository from "../../src/repositories/user.repository";
import UserService from "../../src/services/user.service";
import EngineService from "../../src/services/engine.service";
import AuthService from "../../src/services/auth.service";
import { CadastroRequest, PlanoDTO } from "../../src/types/plano.types";

function planoDTO(overrides: Partial<PlanoDTO> = {}): PlanoDTO {
    return {
        metas: { calorias: 1711, proteinaG: 140, carboidratoG: 181, gorduraG: 48, aguaMl: 2000 },
        treino: {
            split: "Upper / Lower",
            diasPorSemana: 4,
            sessoes: [
                {
                    nome: "Upper",
                    diasSemana: ["Segunda", "Quinta"],
                    gruposMusculares: "Peito",
                    exercicios: [
                        {
                            exercicioId: 1,
                            nome: "Supino reto com barra",
                            grupoMuscular: "Peito",
                            series: 3,
                            repeticoes: "8-12",
                            descansoSegundos: 90,
                        },
                    ],
                },
            ],
        },
        dieta: {
            refeicoes: [
                {
                    nome: "Almoço",
                    horario: "12:30",
                    kcal: 599,
                    itens: [{ alimentoId: 3, nome: "Arroz, tipo 1, cozido", gramas: 150, kcal: 192 }],
                },
            ],
        },
        ...overrides,
    };
}

function cadastroBase(overrides: Partial<CadastroRequest> = {}): CadastroRequest {
    return {
        conta: {
            nome: "Ana",
            sobrenome: "Silva",
            email: "ana@teste.com",
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
            restricoesFisicas: ["Joelho"],
        },
        plano: planoDTO(),
        ...overrides,
    };
}

/**
 * Todos os métodos como jest.Mock — tipo mapeado, e não interseção com
 * `Record<string, jest.Mock>`: numa interseção o método concreto vence a
 * assinatura de índice e `.mockResolvedValue` some.
 */
type UserRepositoryFake = { [K in keyof UserRepository]: jest.Mock };

/** O perfil como `buscarPerfilCompleto` o devolve. */
function perfilCompleto(overrides: Record<string, unknown> = {}) {
    return {
        nome: "Ana",
        sobrenome: "Silva",
        sexo: "F",
        dataNascimento: new Date("1998-04-10T00:00:00.000Z"),
        alturaCm: 165,
        percentualGordura: 20,
        nivelAtividade: "MODERADO",
        nivelExperiencia: "INICIANTE",
        objetivo: "PERDER",
        diasPorSemana: 4,
        numeroRefeicoes: 4,
        restricoes: [{ tipo: "ALIMENTAR", descricao: "Lactose" }],
        ...overrides,
    };
}

// O banco nunca é tocado nos testes: repository falso, sem Postgres nem sujeira.
function repositoryFake(emailExistente = false) {
    return {
        buscarPorEmail: jest.fn().mockResolvedValue(emailExistente ? { id: "existente" } : null),
        buscarPerfilCompleto: jest.fn().mockResolvedValue(perfilCompleto()),
        atualizarPerfil: jest.fn().mockResolvedValue(undefined),
        excluir: jest.fn().mockResolvedValue(undefined),
        buscarSenhaHash: jest.fn().mockResolvedValue(null),
        // O `criar` do Prisma devolve a linha inteira, e o service usa nome,
        // sobrenome e e-mail para abrir a sessão — um fake só com `id` deixaria
        // esses campos `undefined` sem nenhum teste acusar.
        criar: jest.fn().mockResolvedValue({
            id: "usuario-1",
            nome: "Ana",
            sobrenome: "Silva",
            email: "ana@teste.com",
        }),
    } as unknown as UserRepositoryFake;
}

// rounds baixo de propósito: bcrypt com custo real deixaria a suíte lenta. O
// repository não é exercitado por este caminho — o cadastro só usa gerarHash.
const authService = new AuthService(repositoryFake() as unknown as UserRepository, 4);
const engineService = new EngineService();
const perfilMapper = new PerfilMapper();

/** O usuário como o banco o guarda, com o peso atual do histórico. */
function perfilNoBanco(pesoKg = 65) {
    return {
        sexo: "F",
        dataNascimento: new Date("1998-04-10T00:00:00.000Z"),
        alturaCm: 165,
        percentualGordura: 20,
        nivelAtividade: "MODERADO",
        nivelExperiencia: "INICIANTE",
        objetivo: "PERDER",
        diasPorSemana: 4,
        numeroRefeicoes: 4,
        pesos: [{ pesoKg }],
    };
}

function pesoRepositoryFake(perfil: unknown = perfilNoBanco()) {
    return {
        criar: jest.fn().mockResolvedValue(undefined),
        listar: jest.fn().mockResolvedValue([
            { id: "p2", pesoKg: 63, registradoEm: new Date("2026-08-31T12:00:00.000Z") },
            { id: "p1", pesoKg: 65, registradoEm: new Date("2026-08-01T12:00:00.000Z") },
        ]),
        buscarPerfil: jest.fn().mockResolvedValue(perfil),
    } as unknown as { [K in keyof PesoRepository]: jest.Mock };
}

function planRepositoryFake(temFicha = true) {
    return {
        atualizarMetasDaFichaAtiva: jest.fn().mockResolvedValue(temFicha),
    } as unknown as { [K in keyof PlanRepository]: jest.Mock };
}

function montar(
    repository = repositoryFake(),
    pesoRepository = pesoRepositoryFake(),
    planRepository = planRepositoryFake(),
) {
    return {
        repository,
        pesoRepository,
        planRepository,
        service: new UserService(
            repository as unknown as UserRepository,
            engineService,
            authService,
            pesoRepository as unknown as PesoRepository,
            planRepository as unknown as PlanRepository,
            perfilMapper,
        ),
    };
}

describe("UserService", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => logSpy.mockRestore());

    it("devolve o usuário criado", async () => {
        const { service } = montar();

        const sessao = await service.cadastrar(cadastroBase());

        expect(sessao.usuario).toEqual({
            usuarioId: "usuario-1",
            nome: "Ana",
            sobrenome: "Silva",
            email: "ana@teste.com",
        });
    });

    // Sem isto o recém-cadastrado teria de fazer login com a senha que acabou
    // de escolher para conseguir chamar qualquer rota autenticada.
    it("já devolve a sessão aberta, sem exigir login em seguida", async () => {
        const { service } = montar();

        const { token } = await service.cadastrar(cadastroBase());

        expect(lerToken(token)).toBe("usuario-1");
    });

    it.each([
        ["e-mail sem arroba", { email: "ana.teste.com" }, /e-mail/i],
        ["e-mail vazio", { email: "" }, /e-mail/i],
        ["senha curta", { senha: "1234567" }, /senha/i],
        ["nome vazio", { nome: " " }, /nome/i],
        ["sobrenome vazio", { sobrenome: "" }, /sobrenome/i],
        // RF36: sem aceite não há conta.
        ["aceite ausente", { aceiteTermos: false }, /aceitar/i],
        ["aceite em texto em vez de booleano", { aceiteTermos: "true" }, /aceitar/i],
    ])("recusa cadastro com %s, antes de tocar o banco", async (_caso, campo, mensagem) => {
        const { service, repository } = montar();
        const cadastro = cadastroBase();

        // O cast existe porque parte dos casos manda um valor do TIPO ERRADO de
        // propósito ("true" em vez de true): é exatamente o payload que chega de
        // um cliente qualquer, que o TypeScript não governa.
        const conta = { ...cadastro.conta, ...campo } as typeof cadastro.conta;

        await expect(service.cadastrar({ ...cadastro, conta })).rejects.toThrow(mensagem);

        expect(repository.buscarPorEmail).not.toHaveBeenCalled();
        expect(repository.criar).not.toHaveBeenCalled();
    });

    it("grava a senha em hash, nunca em texto", async () => {
        const { service, repository } = montar();

        await service.cadastrar(cadastroBase());
        const { senhaHash } = repository.criar.mock.calls[0][0];

        expect(senhaHash).not.toBe("12345678");
        // Confere pelo bcrypt direto: o que importa é que o hash GRAVADO
        // valida a senha original, não por qual método ele foi conferido.
        await expect(bcrypt.compare("12345678", senhaHash)).resolves.toBe(true);
    });

    // O PlanoDTO não carrega tmb/tdee/frequência/macros por refeição — eles vêm
    // do recálculo, e é isso que permite o DTO ficar enxuto.
    it("recalcula os números e os entrega ao repository", async () => {
        const { service, repository } = montar();
        const cadastro = cadastroBase();

        await service.cadastrar(cadastro);
        const { resultado } = repository.criar.mock.calls[0][0];
        const esperado = engineService.calcular(cadastro.perfil!);

        expect(resultado.metabolismo.tmb).toBe(esperado.metabolismo.tmb);
        expect(resultado.metabolismo.tdee).toBe(esperado.metabolismo.tdee);
        expect(resultado.treino.seriesPorGrupoSemana).toBe(esperado.treino.seriesPorGrupoSemana);
        expect(resultado.dieta.refeicoes).toEqual(esperado.dieta.refeicoes);
    });

    it("recusa e-mail já cadastrado", async () => {
        const { service, repository } = montar(repositoryFake(true));

        await expect(service.cadastrar(cadastroBase())).rejects.toThrow(ConflitoError);
        expect(repository.criar).not.toHaveBeenCalled();
    });

    it.each([
        ["sem perfil", { perfil: null }],
        ["sem plano", { plano: null }],
        ["com plano sem treino", { plano: planoDTO({ treino: { split: "", diasPorSemana: 4, sessoes: [] } }) }],
        ["com plano sem dieta", { plano: planoDTO({ dieta: { refeicoes: [] } }) }],
    ])("recusa cadastro %s", async (_caso, override) => {
        const { service, repository } = montar();

        await expect(
            service.cadastrar(cadastroBase(override as Partial<CadastroRequest>)),
        ).rejects.toThrow(ValidationError);

        expect(repository.criar).not.toHaveBeenCalled();
    });

    // Perfil inválido tem de barrar ANTES de gravar, senão sobra usuário órfão.
    it("valida o perfil antes de tocar no banco", async () => {
        const { service, repository } = montar();
        const cadastro = cadastroBase();
        cadastro.perfil!.diasPorSemana = 9;

        await expect(service.cadastrar(cadastro)).rejects.toThrow(
            "diasPorSemana deve ser um inteiro entre 2 e 6",
        );
        expect(repository.criar).not.toHaveBeenCalled();
    });

    it("não expõe a senha no log", async () => {
        const { service } = montar();

        await service.cadastrar(cadastroBase());

        expect(logSpy.mock.calls.flat().join(" ")).not.toContain("12345678");
    });

    describe("registrarPeso", () => {
        it("grava o peso e devolve o histórico", async () => {
            const { service, pesoRepository } = montar();

            const resumo = await service.registrarPeso("u1", 63);

            expect(pesoRepository.criar).toHaveBeenCalledWith("u1", 63);
            expect(resumo.historico[0].pesoKg).toBe(63);
        });

        // RF34: registrar o peso RECALCULA. Sem isto o usuário emagreceria e
        // continuaria com a meta calórica de quando era mais pesado.
        it("recalcula as metas e as grava na ficha ativa", async () => {
            const { service, planRepository } = montar(
                repositoryFake(),
                pesoRepositoryFake(perfilNoBanco(58)),
            );

            const resumo = await service.registrarPeso("u1", 58);

            expect(planRepository.atualizarMetasDaFichaAtiva).toHaveBeenCalledWith(
                "u1",
                resumo.metas,
            );
            expect(resumo.metas?.caloriasAlvo).toBeGreaterThan(0);
            expect(resumo.metas?.metaAguaMl).toBeGreaterThan(0);
        });

        // O peso NOVO é que manda: recalcular sobre o antigo devolveria a meta
        // que já estava lá, e ninguém notaria.
        it("recalcula sobre o peso mais recente, não sobre o anterior", async () => {
            const magro = montar(repositoryFake(), pesoRepositoryFake(perfilNoBanco(50)));
            const pesado = montar(repositoryFake(), pesoRepositoryFake(perfilNoBanco(90)));

            const [a, b] = await Promise.all([
                magro.service.registrarPeso("u1", 50),
                pesado.service.registrarPeso("u1", 90),
            ]);

            expect(b.metas!.caloriasAlvo).toBeGreaterThan(a.metas!.caloriasAlvo);
            expect(b.metas!.metaAguaMl).toBeGreaterThan(a.metas!.metaAguaMl);
        });

        // O cardápio continua sendo o da meta antiga — trocá-lo é decisão do
        // usuário (RF20), não efeito colateral de subir na balança.
        it("avisa que o plano ficou defasado quando havia ficha ativa", async () => {
            const { service } = montar();

            const resumo = await service.registrarPeso("u1", 63);

            expect(resumo.planoDesatualizado).toBe(true);
        });

        it("não avisa defasagem quando não havia ficha ativa", async () => {
            const { service } = montar(
                repositoryFake(),
                pesoRepositoryFake(),
                planRepositoryFake(false),
            );

            const resumo = await service.registrarPeso("u1", 63);

            expect(resumo.planoDesatualizado).toBe(false);
        });

        // Um peso errado propaga para TMB, meta calórica, macros e hidratação de
        // uma vez só: recusá-lo aqui é mais barato que corrigir depois.
        it.each([0, -70, 7, 800, Number.NaN])("recusa pesoKg %p sem gravar", async (pesoKg) => {
            const { service, pesoRepository } = montar();

            await expect(service.registrarPeso("u1", pesoKg)).rejects.toThrow(ValidationError);
            expect(pesoRepository.criar).not.toHaveBeenCalled();
        });
    });

    describe("consultarPeso", () => {
        it("devolve as metas vigentes sem gravar nada", async () => {
            const { service, pesoRepository, planRepository } = montar();

            const resumo = await service.consultarPeso("u1");

            expect(resumo.metas?.tmb).toBeGreaterThan(0);
            expect(pesoRepository.criar).not.toHaveBeenCalled();
            expect(planRepository.atualizarMetasDaFichaAtiva).not.toHaveBeenCalled();
        });

        it("devolve metas nulas quando não há peso registrado", async () => {
            const { service } = montar(
                repositoryFake(),
                pesoRepositoryFake({ ...perfilNoBanco(), pesos: [] }),
            );

            await expect(service.consultarPeso("u1")).resolves.toMatchObject({ metas: null });
        });
    });

    // RF10 / UC06. O recálculo é CONDICIONAL: o FA02 é o caso de quem mexeu só
    // nas restrições, que não entram em fórmula nenhuma.
    describe("atualizarPerfil", () => {
        it("grava só os campos enviados", async () => {
            const { service, repository } = montar();

            await service.atualizarPerfil("u1", { objetivo: "ganhar" });

            const [, dados] = repository.atualizarPerfil.mock.calls[0];
            expect(dados).toEqual({ objetivo: "GANHAR" });
        });

        // Sem essa distinção, mandar `{ objetivo }` apagaria altura, nível de
        // atividade e o resto do perfil.
        it("não toca em campo ausente", async () => {
            const { service, repository } = montar();

            await service.atualizarPerfil("u1", { nome: "Aninha" });

            const [, dados] = repository.atualizarPerfil.mock.calls[0];
            expect(dados).not.toHaveProperty("alturaCm");
            expect(dados).not.toHaveProperty("nivelAtividade");
        });

        // RN12.
        it.each([
            ["objetivo", { objetivo: "ganhar" as const }],
            ["nível de atividade", { nivelAtividade: "intenso" as const }],
            ["altura", { altura: 170 }],
            ["dias por semana", { diasPorSemana: 5 }],
            ["data de nascimento", { dataNascimento: "1990-01-01" }],
        ])("recalcula ao alterar %s", async (_caso, campo) => {
            const { service, planRepository } = montar();

            const resultado = await service.atualizarPerfil("u1", campo);

            expect(resultado.recalculado).toBe(true);
            expect(resultado.metas?.caloriasAlvo).toBeGreaterThan(0);
            expect(planRepository.atualizarMetasDaFichaAtiva).toHaveBeenCalled();
        });

        // FA02: anunciar "metas atualizadas" quando nada mudou treinaria o
        // usuário a ignorar o aviso.
        it.each([
            ["restrições alimentares", { restricoesAlimentares: ["Glúten"] }],
            ["nome", { nome: "Aninha" }],
        ])("NÃO recalcula ao alterar só %s", async (_caso, campo) => {
            const { service, planRepository } = montar();

            const resultado = await service.atualizarPerfil("u1", campo);

            expect(resultado.recalculado).toBe(false);
            expect(resultado.metas).toBeNull();
            expect(planRepository.atualizarMetasDaFichaAtiva).not.toHaveBeenCalled();
        });

        // Lista vazia é "apaguei todas"; ausente é "não mexi". Tratá-las igual
        // impediria remover a última restrição.
        it("substitui as restrições quando a lista vem, mesmo vazia", async () => {
            const { service, repository } = montar();

            await service.atualizarPerfil("u1", { restricoesAlimentares: [] });

            const [, , restricoes] = repository.atualizarPerfil.mock.calls[0];
            expect(restricoes).toEqual([]);
        });

        it("deixa as restrições intactas quando a lista não vem", async () => {
            const { service, repository } = montar();

            await service.atualizarPerfil("u1", { objetivo: "manter" });

            const [, , restricoes] = repository.atualizarPerfil.mock.calls[0];
            expect(restricoes).toBeNull();
        });

        it.each([
            ["sexo inválido", { sexo: "X" }, /sexo/i],
            ["altura absurda", { altura: 30 }, /altura/i],
            ["objetivo desconhecido", { objetivo: "secar" }, /objetivo/i],
            ["dias fora da faixa", { diasPorSemana: 9 }, /diasPorSemana/i],
            ["refeições fora da faixa", { numeroRefeicoes: 2 }, /numeroRefeicoes/i],
            ["nascimento no futuro", { dataNascimento: "3000-01-01" }, /dataNascimento/i],
        ])("recusa %s sem gravar", async (_caso, campo, mensagem) => {
            const { service, repository } = montar();

            await expect(
                service.atualizarPerfil("u1", campo as never),
            ).rejects.toThrow(mensagem);
            expect(repository.atualizarPerfil).not.toHaveBeenCalled();
        });

        it("devolve o perfil no vocabulário da API, não no do banco", async () => {
            const { service } = montar();

            const { perfil } = await service.atualizarPerfil("u1", { nome: "Ana" });

            expect(perfil.nivelAtividade).toBe("moderado");
            expect(perfil.objetivo).toBe("perder");
            expect(perfil.restricoesAlimentares).toEqual(["Lactose"]);
        });
    });

    // RF35 / UC18. A exclusão é irreversível: exigir só o token faria de um
    // aparelho desbloqueado por alguns segundos o bastante para destruir o
    // histórico de alguém.
    describe("excluirConta", () => {
        /** Um service cujo AuthService confere a senha contra um hash de verdade. */
        async function comSenha(senhaCorreta: string) {
            const repository = repositoryFake();
            const hash = await authService.gerarHash(senhaCorreta);
            repository.buscarSenhaHash.mockResolvedValue(hash);

            return {
                repository,
                service: new UserService(
                    repository as unknown as UserRepository,
                    engineService,
                    new AuthService(repository as unknown as UserRepository, 4),
                    pesoRepositoryFake() as unknown as PesoRepository,
                    planRepositoryFake() as unknown as PlanRepository,
                    perfilMapper,
                ),
            };
        }

        it("apaga a conta quando a senha confere", async () => {
            const { service, repository } = await comSenha("12345678");

            await service.excluirConta("u1", "12345678");

            expect(repository.excluir).toHaveBeenCalledWith("u1");
        });

        it.each([
            ["senha errada", "outra-senha"],
            ["senha vazia", ""],
            ["senha ausente", undefined],
        ])("recusa %s sem apagar nada", async (_caso, senha) => {
            const { service, repository } = await comSenha("12345678");

            await expect(
                service.excluirConta("u1", senha as string),
            ).rejects.toThrow(AutenticacaoError);
            expect(repository.excluir).not.toHaveBeenCalled();
        });

        // A linha de log sobreviveria à exclusão e guardaria justamente o dado
        // pessoal que o usuário pediu para apagar.
        it("não registra e-mail nem id no log da exclusão", async () => {
            const { service } = await comSenha("12345678");

            await service.excluirConta("u1", "12345678");

            expect(logSpy.mock.calls.flat().join(" ")).not.toContain("u1");
        });
    });
});
