import { PerfilInput } from "./CalculoService";

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
    receberCadastro(cadastro: CadastroInput): { recebido: true } {
        const { senha, ...contaSemSenha } = cadastro.conta;

        console.log(
            "[onboarding] payload recebido:",
            JSON.stringify(
                { conta: { ...contaSemSenha, senha: "***" }, perfil: cadastro.perfil },
                null,
                2,
            ),
        );

        return { recebido: true };
    }
}
