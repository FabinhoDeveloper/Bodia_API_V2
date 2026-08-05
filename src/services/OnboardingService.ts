import ValidationError from "../errors/ValidationError";
import CalculoService, { PerfilInput } from "./CalculoService";
import PlanoService from "./PlanoService";

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

/**
 * Orquestra o cadastro que chega do app (POST /api/onboarding, via
 * OnboardingController): valida se há perfil, manda calcular o plano
 * (CalculoService) e manda gerar treino e dieta com a IA (PlanoService).
 *
 * Imprime os três estágios no console — plano calculado, plano gerado pela
 * IA e a conferência dos macros — porque, por enquanto, é assim que o
 * resultado é observado: nada ainda é persistido nem devolvido na resposta
 * HTTP (que continua sendo só { recebido: true }).
 */
export default class OnboardingService {
    private readonly calculoService;
    private readonly planoService;

    constructor(calculoService: CalculoService, planoService: PlanoService) {
        this.calculoService = calculoService;
        this.planoService = planoService;
    }

    async receberCadastro(cadastro: CadastroInput): Promise<{ recebido: true }> {
        if (!cadastro.perfil) {
            throw new ValidationError("perfil é obrigatório para gerar o plano");
        }

        const resultado = this.calculoService.calcular(cadastro.perfil);

        console.log("[onboarding] plano calculado:", JSON.stringify(resultado, null, 2));

        const { plano, validacao } = await this.planoService.gerar(cadastro.perfil, resultado);

        console.log("[onboarding] plano gerado pela IA:", JSON.stringify(plano, null, 2));
        console.log("[onboarding] conferência dos macros:", JSON.stringify(validacao, null, 2));

        return { recebido: true };
    }
}
