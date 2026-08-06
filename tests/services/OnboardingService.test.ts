import ValidationError from "../../src/errors/ValidationError";
import CalculoService from "../../src/services/CalculoService";
import OnboardingService, { CadastroInput } from "../../src/services/OnboardingService";
import PlanoMapper from "../../src/services/PlanoMapper";
import PlanoService, { PlanoValidado } from "../../src/services/PlanoService";

function cadastroBase(overrides: Partial<CadastroInput> = {}): CadastroInput {
    return {
        conta: { nome: "Ana", sobrenome: "Silva", email: "a@b.com", senha: "12345678" },
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
};

// A IA nunca é chamada de verdade nos testes: gastaria crédito e deixaria a suíte
// dependente de rede.
function planoServiceFake(gerar = jest.fn().mockResolvedValue(PLANO_FAKE)) {
    return { gerar } as unknown as PlanoService & { gerar: jest.Mock };
}

describe("OnboardingService", () => {
    const calculoService = new CalculoService();

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
        const onboardingService = new OnboardingService(
            calculoService,
            planoServiceFake(),
            new PlanoMapper(),
        );
        const cadastro = cadastroBase();

        const { plano } = await onboardingService.receberCadastro(cadastro);
        const esperado = calculoService.calcular(cadastro.perfil!);

        expect(plano.metas.calorias).toBe(esperado.meta.caloriasAlvo);
        expect(plano.metas.proteinaG).toBe(esperado.macros.proteina.g);
        expect(plano.treino.split).toBe(esperado.treino.split);
        expect(plano.dieta.refeicoes[0].horario).toBeTruthy();
        expect(plano.treino.sessoes[0].gruposMusculares).toBeTruthy();
    });

    it("registra no console o plano calculado, não o payload recebido", async () => {
        const onboardingService = new OnboardingService(calculoService, planoServiceFake(), new PlanoMapper());
        const cadastro = cadastroBase();

        await onboardingService.receberCadastro(cadastro);

        const [rotulo, corpo] = logSpy.mock.calls[0];
        expect(rotulo).toBe("[onboarding] plano calculado:");
        expect(JSON.parse(corpo)).toEqual(calculoService.calcular(cadastro.perfil!));
    });

    it("não expõe dados da conta no log", async () => {
        const onboardingService = new OnboardingService(calculoService, planoServiceFake(), new PlanoMapper());

        await onboardingService.receberCadastro(cadastroBase());

        const tudoQueFoiLogado = logSpy.mock.calls.flat().join(" ");
        expect(tudoQueFoiLogado).not.toContain("12345678");
        expect(tudoQueFoiLogado).not.toContain("a@b.com");
    });

    it("gera o plano com a IA e registra o plano e a conferência dos macros", async () => {
        const planoService = planoServiceFake();
        const onboardingService = new OnboardingService(calculoService, planoService, new PlanoMapper());
        const cadastro = cadastroBase();

        await onboardingService.receberCadastro(cadastro);

        expect(planoService.gerar).toHaveBeenCalledWith(
            cadastro.perfil,
            calculoService.calcular(cadastro.perfil!),
        );
        expect(logSpy.mock.calls[1][0]).toBe("[onboarding] conferência dos macros:");
        expect(logSpy.mock.calls[2][0]).toBe("[onboarding] plano enviado ao app:");
    });

    it("propaga a falha da IA em vez de engolir o erro", async () => {
        const planoService = planoServiceFake(jest.fn().mockRejectedValue(new Error("401 Unauthorized")));
        const onboardingService = new OnboardingService(calculoService, planoService, new PlanoMapper());

        await expect(onboardingService.receberCadastro(cadastroBase())).rejects.toThrow(
            "401 Unauthorized",
        );
    });

    it("rejeita cadastro sem perfil (não há como calcular o plano)", async () => {
        const planoService = planoServiceFake();
        const onboardingService = new OnboardingService(calculoService, planoService, new PlanoMapper());
        const cadastro = cadastroBase({ perfil: null });

        await expect(onboardingService.receberCadastro(cadastro)).rejects.toThrow(ValidationError);
        await expect(onboardingService.receberCadastro(cadastro)).rejects.toThrow(
            "perfil é obrigatório para gerar o plano",
        );
        expect(planoService.gerar).not.toHaveBeenCalled();
    });

    it("propaga como ValidationError o erro de validação do CalculoService", async () => {
        const planoService = planoServiceFake();
        const onboardingService = new OnboardingService(calculoService, planoService, new PlanoMapper());
        const cadastro = cadastroBase();
        cadastro.perfil!.diasPorSemana = 9;

        await expect(onboardingService.receberCadastro(cadastro)).rejects.toThrow(ValidationError);
        await expect(onboardingService.receberCadastro(cadastro)).rejects.toThrow(
            "diasPorSemana deve ser um inteiro entre 2 e 6",
        );
        expect(planoService.gerar).not.toHaveBeenCalled();
    });
});
