import ValidationError from "../errors/ValidationError";
import CalculoService, { PerfilInput } from "./CalculoService";
import LlmService from "./LlmService";

export interface ContaInput {
    nome: string;
    sobrenome: string;
    email: string;
    senha: string;
}

export interface PerfilOnboardingInput extends PerfilInput {
    restricoesAlimentares: string[];
    restricoesFisicas: string[];
}

export interface CadastroInput {
    conta: ContaInput;
    perfil: PerfilOnboardingInput | null;
}

export default class OnboardingService {
    private readonly calculoService;
    private readonly llmService;

    constructor(calculoService: CalculoService, llmService: LlmService) {
        this.calculoService = calculoService;
        this.llmService = llmService;
    }

    async receberCadastro(cadastro: CadastroInput): Promise<{ recebido: true }> {
        if (!cadastro.perfil) {
            throw new ValidationError("perfil é obrigatório para gerar o plano");
        }

        const resultado = this.calculoService.calcular(cadastro.perfil);

        console.log("[onboarding] plano calculado:", JSON.stringify(resultado, null, 2));

        const respostaIa = await this.llmService.enviarMensagem(
            "Confirme em uma frase curta que você recebeu esta mensagem e está pronto para, " +
                "no futuro, gerar planos de treino e dieta a partir de dados calculados.",
        );

        console.log("[onboarding] resposta da IA (teste de conexão):", respostaIa);

        return { recebido: true };
    }
}
