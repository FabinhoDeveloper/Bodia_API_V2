import bcrypt from "bcrypt";

import { assinarToken } from "../config/jwt";
import AutenticacaoError from "../errors/autenticacao.error";
import UserRepository from "../repositories/user.repository";
import { LoginInput, SessaoIniciada } from "../types/auth.types";

/**
 * Tudo que é autenticação: login e o hash de senha que o cadastro consome.
 *
 * Absorveu o antigo SenhaService — bcrypt era a única coisa que ele fazia, e
 * fora daqui não há outro consumidor. O custo do bcrypt vem por construtor
 * (src/config/auth.ts), como qualquer outra configuração.
 *
 * A senha em texto nunca sai daqui: quem chama recebe hash ou a sessão já
 * iniciada, nunca a senha.
 *
 * O token é assinado por `config/jwt.ts`, importado direto como o bcrypt — o
 * segredo fica lá e não passa por este service.
 */
export default class AuthService {
    private readonly userRepository;
    private readonly bcryptRounds;

    constructor(userRepository: UserRepository, bcryptRounds: number) {
        this.userRepository = userRepository;
        this.bcryptRounds = bcryptRounds;
    }

    async entrar({ email, senha }: LoginInput): Promise<SessaoIniciada> {
        // Credencial ausente é recusada como credencial errada, não como 400:
        // sem isto um `email` undefined chegaria ao `where` do Prisma e viraria
        // 500 — que denuncia mais sobre o servidor do que um 401.
        if (typeof email !== "string" || typeof senha !== "string") {
            throw new AutenticacaoError("E-mail ou senha incorretos");
        }

        const usuario = await this.userRepository.buscarPorEmail(email);

        // E-mail inexistente e senha errada devolvem exatamente o mesmo erro.
        // Diferenciar transformaria a resposta num oráculo de quais e-mails
        // estão cadastrados.
        const senhaConfere = usuario ? await this.conferirSenha(senha, usuario.senhaHash) : false;

        if (!usuario || !senhaConfere) {
            throw new AutenticacaoError("E-mail ou senha incorretos");
        }

        return this.abrirSessao(usuario);
    }

    /**
     * Emite o token de um usuário já identificado.
     *
     * Público porque o CADASTRO também precisa dele: sem token, quem acabou de
     * criar a conta não conseguiria chamar nenhuma rota autenticada e teria de
     * digitar a senha que acabou de escolher.
     */
    abrirSessao(usuario: {
        id: string;
        nome: string;
        sobrenome: string;
        email: string;
    }): SessaoIniciada {
        return {
            token: assinarToken(usuario.id),
            usuario: {
                usuarioId: usuario.id,
                nome: usuario.nome,
                sobrenome: usuario.sobrenome,
                email: usuario.email,
            },
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
