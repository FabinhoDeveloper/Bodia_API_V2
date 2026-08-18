import AutenticacaoError from "../errors/AutenticacaoError";
import UserRepository from "../repositories/user.repository";
import { LoginInput, UsuarioAutenticado } from "../types/auth.types";
import SenhaService from "./SenhaService";

/**
 * Autentica pelo e-mail e senha. Enquanto não há JWT, o app guarda o
 * `usuarioId` devolvido e o usa para pedir o próprio plano.
 */
export default class LoginService {
    private readonly userRepository;
    private readonly senhaService;

    constructor(userRepository: UserRepository, senhaService: SenhaService) {
        this.userRepository = userRepository;
        this.senhaService = senhaService;
    }

    async entrar({ email, senha }: LoginInput): Promise<UsuarioAutenticado> {
        const usuario = await this.userRepository.buscarPorEmail(email);

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
