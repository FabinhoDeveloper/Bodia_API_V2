import ConflitoError from "../../src/errors/ConflitoError";
import ValidationError from "../../src/errors/ValidationError";
import UserRepository from "../../src/repositories/user.repository";
import CadastroService from "../../src/services/CadastroService";
import EngineService from "../../src/services/engine.service";
import SenhaService from "../../src/services/SenhaService";
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
                    dia: "Segunda",
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
        conta: { nome: "Ana", sobrenome: "Silva", email: "ana@teste.com", senha: "12345678" },
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
            restricoesAlimentares: ["Lactose"],
            restricoesFisicas: ["Joelho"],
        },
        plano: planoDTO(),
        ...overrides,
    };
}

// O banco nunca é tocado nos testes: repository falso, sem Postgres nem sujeira.
function repositoryFake(emailExistente = false) {
    return {
        buscarPorEmail: jest.fn().mockResolvedValue(emailExistente ? { id: "existente" } : null),
        criar: jest.fn().mockResolvedValue({ id: "usuario-1" }),
    } as unknown as UserRepository & { buscarPorEmail: jest.Mock; criar: jest.Mock };
}

// rounds baixo de propósito: bcrypt com custo real deixaria a suíte lenta.
const senhaService = new SenhaService(4);
const engineService = new EngineService();

function montar(repository = repositoryFake()) {
    return {
        repository,
        service: new CadastroService(repository, engineService, senhaService),
    };
}

describe("CadastroService", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => logSpy.mockRestore());

    it("devolve o id do usuário criado", async () => {
        const { service } = montar();

        await expect(service.cadastrar(cadastroBase())).resolves.toEqual({ usuarioId: "usuario-1" });
    });

    it("grava a senha em hash, nunca em texto", async () => {
        const { service, repository } = montar();

        await service.cadastrar(cadastroBase());
        const { senhaHash } = repository.criar.mock.calls[0][0];

        expect(senhaHash).not.toBe("12345678");
        await expect(senhaService.conferir("12345678", senhaHash)).resolves.toBe(true);
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
});

describe("SenhaService", () => {
    it("confere a senha correta e recusa a errada", async () => {
        const hash = await senhaService.gerarHash("12345678");

        await expect(senhaService.conferir("12345678", hash)).resolves.toBe(true);
        await expect(senhaService.conferir("87654321", hash)).resolves.toBe(false);
    });

    // O salt aleatório é o que impede descobrir senhas iguais comparando hashes.
    it("gera hashes distintos para a mesma senha", async () => {
        const [a, b] = await Promise.all([
            senhaService.gerarHash("12345678"),
            senhaService.gerarHash("12345678"),
        ]);

        expect(a).not.toBe(b);
    });
});
