import ValidationError from "../../src/errors/ValidationError";
import CalculoService from "../../src/services/CalculoService";
import OnboardingService, { CadastroInput } from "../../src/services/OnboardingService";

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

describe("OnboardingService", () => {
    const calculoService = new CalculoService();
    const onboardingService = new OnboardingService(calculoService);

    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("confirma o recebimento quando o perfil é válido", () => {
        expect(onboardingService.receberCadastro(cadastroBase())).toEqual({ recebido: true });
    });

    it("registra no console o plano calculado, não o payload recebido", () => {
        const cadastro = cadastroBase();
        onboardingService.receberCadastro(cadastro);

        const [rotulo, corpo] = logSpy.mock.calls[0];
        expect(rotulo).toBe("[onboarding] plano calculado:");
        expect(JSON.parse(corpo)).toEqual(calculoService.calcular(cadastro.perfil!));
    });

    it("não expõe dados da conta no log", () => {
        onboardingService.receberCadastro(cadastroBase());

        const corpo = logSpy.mock.calls[0][1];
        expect(corpo).not.toContain("12345678");
        expect(corpo).not.toContain("a@b.com");
    });

    it("rejeita cadastro sem perfil (não há como calcular o plano)", () => {
        expect(() => onboardingService.receberCadastro(cadastroBase({ perfil: null }))).toThrow(
            ValidationError,
        );
        expect(() => onboardingService.receberCadastro(cadastroBase({ perfil: null }))).toThrow(
            "perfil é obrigatório para gerar o plano",
        );
    });

    it("propaga como ValidationError o erro de validação do CalculoService", () => {
        const cadastro = cadastroBase();
        cadastro.perfil!.diasPorSemana = 9;

        expect(() => onboardingService.receberCadastro(cadastro)).toThrow(ValidationError);
        expect(() => onboardingService.receberCadastro(cadastro)).toThrow(
            "diasPorSemana deve ser um inteiro entre 2 e 6",
        );
    });
});
