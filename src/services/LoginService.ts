import AutenticacaoError from "../errors/AutenticacaoError";
import CadastroRepository from "../repositories/CadastroRepository";
import SenhaService from "./SenhaService";

export interface LoginInput {
    email: string;
    senha: string;
}

export interface UsuarioAutenticado {
    usuarioId: string;
    nome: string;
    sobrenome: string;
    email: string;
}

/**
 * Autentica pelo e-mail e senha. Enquanto não há JWT, o app guarda o
 * `usuarioId` devolvido e o usa para pedir o próprio plano.
 */
export default class LoginService {
    private readonly cadastroRepository;
    private readonly senhaService;

    constructor(cadastroRepository: CadastroRepository, senhaService: SenhaService) {
        this.cadastroRepository = cadastroRepository;
        this.senhaService = senhaService;
    }

    async entrar({ email, senha }: LoginInput): Promise<UsuarioAutenticado> {
        const usuario = await this.cadastroRepository.buscarPorEmail(email);

        // E-mail inexistente e senha errada devolvem exatamente o mesmo erro.
        // Diferenciar transformaria a resposta num oráculo de quais e-mails
        // estão cadastrados.
        const senhaConfere = usuario ? await this.senhaService.conferir(senha, usuario.senhaHash) : false;

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
}
