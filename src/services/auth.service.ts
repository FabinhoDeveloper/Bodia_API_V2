import bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";

import { REDEFINICAO_INTERVALO_MIN_SEG, REDEFINICAO_VALIDADE_MIN, SENHA_MIN } from "../config/auth";
import { assinarToken } from "../config/jwt";
import { montarEmailRedefinicao } from "../emails/redefinicao-senha.email";
import AutenticacaoError from "../errors/autenticacao.error";
import ValidationError from "../errors/validation.error";
import RedefinicaoSenhaRepository from "../repositories/redefinicao-senha.repository";
import UserRepository from "../repositories/user.repository";
import {
    AlteracaoSenhaInput,
    LoginInput,
    RedefinicaoSenhaInput,
    SessaoIniciada,
} from "../types/auth.types";
import { EnviadorEmail } from "../types/email.types";

/**
 * Tudo que é autenticação: login, o hash de senha que o cadastro consome, e a
 * senha em si — redefinir por e-mail (RF03) e trocar dentro da conta.
 *
 * Absorveu o antigo SenhaService — bcrypt era a única coisa que ele fazia, e
 * fora daqui não há outro consumidor. O custo do bcrypt vem por construtor
 * (src/config/auth.ts), como qualquer outra configuração.
 *
 * A senha em texto nunca sai daqui: quem chama recebe hash ou a sessão já
 * iniciada, nunca a senha. O mesmo vale para o token de redefinição: ele só
 * existe em texto no e-mail — o banco recebe o hash.
 *
 * O token de sessão é assinado por `config/jwt.ts`, importado direto como o
 * bcrypt — o segredo fica lá e não passa por este service.
 */
export default class AuthService {
    private readonly userRepository;
    private readonly redefinicaoRepository;
    private readonly enviadorEmail;
    private readonly bcryptRounds;
    private readonly urlPublica;

    constructor(
        userRepository: UserRepository,
        redefinicaoRepository: RedefinicaoSenhaRepository,
        enviadorEmail: EnviadorEmail,
        bcryptRounds: number,
        urlPublica: string,
    ) {
        this.userRepository = userRepository;
        this.redefinicaoRepository = redefinicaoRepository;
        this.enviadorEmail = enviadorEmail;
        this.bcryptRounds = bcryptRounds;
        this.urlPublica = urlPublica;
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

    /**
     * Confere uma senha contra o hash de um usuário já identificado.
     *
     * Público porque a EXCLUSÃO DE CONTA (RF35) precisa dele: apagar tudo é
     * irreversível, e o token sozinho não basta — um aparelho desbloqueado por
     * alguns segundos bastaria para destruir o histórico de outra pessoa.
     *
     * Diferente de `entrar`, aqui já se sabe QUEM é: o id vem do token, e o que
     * se confere é só a posse da senha.
     */
    async conferirSenhaDe(usuarioId: string, senha: string): Promise<boolean> {
        if (typeof senha !== "string" || !senha) return false;

        const hash = await this.userRepository.buscarSenhaHash(usuarioId);

        return hash ? this.conferirSenha(senha, hash) : false;
    }

    /**
     * Envia o link de redefinição de senha (RF03), se o e-mail for de alguém.
     *
     * NUNCA diz se o e-mail existe: e-mail desconhecido, malformado ou dentro do
     * intervalo mínimo termina em silêncio, e quem chama responde igual nos três
     * casos. O controller nem espera por esta Promise — ver o comentário lá.
     *
     * O token é 256 bits de `randomBytes`, e o banco recebe só o SHA-256 dele. O
     * link o leva no FRAGMENTO (`#token=`), que o navegador não envia ao
     * servidor: assim ele não fica no access log do nginx ao abrir a página.
     */
    async solicitarRedefinicao(email: unknown): Promise<void> {
        if (typeof email !== "string" || !email.trim()) return;

        const usuario = await this.userRepository.buscarPorEmail(email.trim());

        if (!usuario) return;

        const ultima = await this.redefinicaoRepository.ultimaSolicitacaoEm(usuario.id);
        const agora = new Date();

        if (ultima && agora.getTime() - ultima.getTime() < REDEFINICAO_INTERVALO_MIN_SEG * 1000) {
            return;
        }

        const token = randomBytes(32).toString("base64url");
        const expiraEm = new Date(agora.getTime() + REDEFINICAO_VALIDADE_MIN * 60 * 1000);

        await this.redefinicaoRepository.substituir(usuario.id, AuthService.hashDoToken(token), expiraEm);

        const { assunto, texto, html } = montarEmailRedefinicao({
            nome: usuario.nome,
            link: `${this.urlPublica}/redefinir-senha#token=${token}`,
            validadeMin: REDEFINICAO_VALIDADE_MIN,
        });

        await this.enviadorEmail.enviar({ para: usuario.email, assunto, texto, html });

        // Sem o e-mail no log: ele diria, a quem lê o log, quem tem conta.
        console.log(`[senha] link de redefinição enviado ao usuário ${usuario.id}`);
    }

    /**
     * Troca a senha pelo link do e-mail. O link é de USO ÚNICO e expira em
     * `REDEFINICAO_VALIDADE_MIN` — as duas garantias são do repository, numa
     * transação só com a gravação da senha.
     *
     * "Não existe", "já usado" e "expirado" dão a mesma mensagem: distinguir não
     * ajuda quem tem o link legítimo (a saída é pedir outro nos três casos) e
     * ajudaria quem está testando tokens.
     */
    async redefinirSenha({ token, novaSenha, confirmacao }: RedefinicaoSenhaInput): Promise<void> {
        this.validarSenhaNova(novaSenha, confirmacao);

        if (typeof token !== "string" || !token) {
            throw new ValidationError(AuthService.LINK_INVALIDO);
        }

        const consumido = await this.redefinicaoRepository.consumirERedefinir(
            AuthService.hashDoToken(token),
            await this.gerarHash(novaSenha),
            new Date(),
        );

        if (!consumido) {
            throw new ValidationError(AuthService.LINK_INVALIDO);
        }

        console.log("[senha] senha redefinida pelo link");
    }

    /**
     * Troca a senha de quem já está logado: exige a atual, além do token — pela
     * mesma razão da exclusão de conta, um aparelho desbloqueado não basta.
     *
     * Senha atual errada é `ValidationError` (400), NÃO `AutenticacaoError`
     * (401): o app derruba a sessão em qualquer 401 recebido com token, e errar
     * a senha atual mandaria o usuário para a tela de boas-vindas.
     *
     * A troca marca `senhaAlteradaEm`, o que invalida TODOS os tokens emitidos
     * até aqui — inclusive o deste aparelho. Por isso devolve uma sessão nova:
     * o app a instala e segue logado, e só os outros aparelhos caem.
     */
    async alterarSenha(
        usuarioId: string,
        { senhaAtual, novaSenha, confirmacao }: AlteracaoSenhaInput,
    ): Promise<SessaoIniciada> {
        this.validarSenhaNova(novaSenha, confirmacao);

        if (!(await this.conferirSenhaDe(usuarioId, senhaAtual))) {
            throw new ValidationError("Senha atual incorreta");
        }

        if (senhaAtual === novaSenha) {
            throw new ValidationError("A nova senha precisa ser diferente da atual");
        }

        const usuario = await this.userRepository.atualizarSenha(
            usuarioId,
            await this.gerarHash(novaSenha),
            new Date(),
        );

        console.log(`[senha] senha alterada pelo usuário ${usuarioId}`);

        return this.abrirSessao(usuario);
    }

    private static readonly LINK_INVALIDO = "Link inválido ou expirado. Peça um novo pelo app.";

    /** Determinístico, ao contrário do bcrypt — é o que permite achar o token pelo índice. */
    private static hashDoToken(token: string): string {
        return createHash("sha256").update(token).digest("hex");
    }

    /**
     * A regra da senha nova é a mesma do cadastro (`SENHA_MIN`, por
     * comprimento). A confirmação é conferida aqui e não só na tela: a tela pode
     * ser contornada.
     */
    private validarSenhaNova(novaSenha: unknown, confirmacao: unknown): asserts novaSenha is string {
        if (typeof novaSenha !== "string" || novaSenha.length < SENHA_MIN) {
            throw new ValidationError(`A nova senha deve ter pelo menos ${SENHA_MIN} caracteres`);
        }

        if (novaSenha !== confirmacao) {
            throw new ValidationError("As senhas não conferem");
        }
    }

    private conferirSenha(senha: string, hash: string): Promise<boolean> {
        return bcrypt.compare(senha, hash);
    }
}
