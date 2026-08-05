import ValidationError from "../../src/errors/ValidationError";
import CalculoService from "../../src/services/CalculoService";
import LlmService from "../../src/services/LlmService";
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

// A IA nunca é chamada de verdade nos testes: gastaria crédito e deixaria a suíte
// dependente de rede.
function llmServiceFake(enviarMensagem = jest.fn().mockResolvedValue("Pronto para ajudar.")) {
    return { enviarMensagem } as unknown as LlmService & { enviarMensagem: jest.Mock };
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

    it("confirma o recebimento quando o perfil é válido", async () => {
        const onboardingService = new OnboardingService(calculoService, llmServiceFake());

        await expect(onboardingService.receberCadastro(cadastroBase())).resolves.toEqual({
            recebido: true,
        });
    });

    it("registra no console o plano calculado, não o payload recebido", async () => {
        const onboardingService = new OnboardingService(calculoService, llmServiceFake());
        const cadastro = cadastroBase();

        await onboardingService.receberCadastro(cadastro);

        const [rotulo, corpo] = logSpy.mock.calls[0];
        expect(rotulo).toBe("[onboarding] plano calculado:");
        expect(JSON.parse(corpo)).toEqual(calculoService.calcular(cadastro.perfil!));
    });

    it("não expõe dados da conta no log", async () => {
        const onboardingService = new OnboardingService(calculoService, llmServiceFake());

        await onboardingService.receberCadastro(cadastroBase());

        const corpo = logSpy.mock.calls[0][1];
        expect(corpo).not.toContain("12345678");
        expect(corpo).not.toContain("a@b.com");
    });

    it("consulta a IA e registra a resposta depois do plano calculado", async () => {
        const llmService = llmServiceFake();
        const onboardingService = new OnboardingService(calculoService, llmService);

        await onboardingService.receberCadastro(cadastroBase());

        expect(llmService.enviarMensagem).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[1]).toEqual([
            "[onboarding] resposta da IA (teste de conexão):",
            "Pronto para ajudar.",
        ]);
    });

    it("propaga a falha da IA em vez de engolir o erro", async () => {
        const llmService = llmServiceFake(jest.fn().mockRejectedValue(new Error("401 Unauthorized")));
        const onboardingService = new OnboardingService(calculoService, llmService);

        await expect(onboardingService.receberCadastro(cadastroBase())).rejects.toThrow(
            "401 Unauthorized",
        );
    });

    it("rejeita cadastro sem perfil (não há como calcular o plano)", async () => {
        const llmService = llmServiceFake();
        const onboardingService = new OnboardingService(calculoService, llmService);
        const cadastro = cadastroBase({ perfil: null });

        await expect(onboardingService.receberCadastro(cadastro)).rejects.toThrow(ValidationError);
        await expect(onboardingService.receberCadastro(cadastro)).rejects.toThrow(
            "perfil é obrigatório para gerar o plano",
        );
        expect(llmService.enviarMensagem).not.toHaveBeenCalled();
    });

    it("propaga como ValidationError o erro de validação do CalculoService", async () => {
        const llmService = llmServiceFake();
        const onboardingService = new OnboardingService(calculoService, llmService);
        const cadastro = cadastroBase();
        cadastro.perfil!.diasPorSemana = 9;

        await expect(onboardingService.receberCadastro(cadastro)).rejects.toThrow(ValidationError);
        await expect(onboardingService.receberCadastro(cadastro)).rejects.toThrow(
            "diasPorSemana deve ser um inteiro entre 2 e 6",
        );
        expect(llmService.enviarMensagem).not.toHaveBeenCalled();
    });
});
