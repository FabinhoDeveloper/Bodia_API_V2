import bcrypt from "bcrypt";

import AutenticacaoError from "../errors/autenticacao.error";
import UserRepository from "../repositories/user.repository";
import { LoginInput, UsuarioAutenticado } from "../types/auth.types";

/**
 * Tudo que é autenticação: login e o hash de senha que o cadastro consome.
 *
 * Absorveu o antigo SenhaService — bcrypt era a única coisa que ele fazia, e
 * fora daqui não há outro consumidor. O custo do bcrypt vem por construtor
 * (src/config/auth.ts), como qualquer outra configuração.
 *
 * A senha em texto nunca sai daqui: quem chama recebe hash ou o usuário
 * autenticado, nunca a senha.
 *
 * É aqui que o JWT entra quando a autenticação de verdade for implementada.
 */
export default class AuthService {
    private readonly userRepository;
    private readonly bcryptRounds;

    constructor(userRepository: UserRepository, bcryptRounds: number) {
        this.userRepository = userRepository;
        this.bcryptRounds = bcryptRounds;
    }

    async entrar({ email, senha }: LoginInput): Promise<UsuarioAutenticado> {
        const usuario = await this.userRepository.buscarPorEmail(email);

        // E-mail inexistente e senha errada devolvem exatamente o mesmo erro.
        // Diferenciar transformaria a resposta num oráculo de quais e-mails
        // estão cadastrados.
        const senhaConfere = usuario ? await this.conferirSenha(senha, usuario.senhaHash) : false;

        if (!usuario || !senhaConfere) {
            throw new AutenticacaoError("E-mail ou senha incorretos");
        }

        return {
            usuarioId: usuario.id,
            nome: usuario.nome,
            sobrenome: usuario.sobrenome,
            email: usuario.email,
        };
    }

    /**
     * Público porque o cadastro (user.service) precisa dele para gravar o
     * usuário. É o único ponto do sistema que produz um hash de senha.
     */
    gerarHash(senha: string): Promise<string> {
        return bcrypt.hash(senha, this.bcryptRounds);
    }

    private conferirSenha(senha: string, hash: string): Promise<boolean> {
        return bcrypt.compare(senha, hash);
    }
}
