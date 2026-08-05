import ValidationError from "../errors/ValidationError";
import CalculoService, { PerfilInput } from "./CalculoService";

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

    constructor(calculoService: CalculoService) {
        this.calculoService = calculoService;
    }

    receberCadastro(cadastro: CadastroInput): { recebido: true } {
        if (!cadastro.perfil) {
            throw new ValidationError("perfil é obrigatório para gerar o plano");
        }

        const resultado = this.calculoService.calcular(cadastro.perfil);

        console.log("[onboarding] plano calculado:", JSON.stringify(resultado, null, 2));

        return { recebido: true };
    }
}
