import bcrypt from "bcrypt";

/**
 * Hash e conferência de senha com bcrypt. Não conhece banco nem HTTP — recebe
 * o custo por construtor e devolve strings.
 *
 * A senha em texto nunca sai daqui: quem chama guarda apenas o hash.
 *
 * Vira AuthService quando o JWT entrar; por ora o nome diz exatamente o que a
 * classe faz.
 */
export default class SenhaService {
    private readonly rounds;

    constructor(rounds: number) {
        this.rounds = rounds;
    }

    gerarHash(senha: string): Promise<string> {
        return bcrypt.hash(senha, this.rounds);
    }

    conferir(senha: string, hash: string): Promise<boolean> {
        return bcrypt.compare(senha, hash);
    }
}
