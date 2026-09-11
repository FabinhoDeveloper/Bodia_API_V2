import { createHash } from "crypto";

import { lerToken } from "../../src/config/jwt";
import AutenticacaoError from "../../src/errors/autenticacao.error";
import ValidationError from "../../src/errors/validation.error";
import RedefinicaoSenhaRepository from "../../src/repositories/redefinicao-senha.repository";
import UserRepository from "../../src/repositories/user.repository";
import AuthService from "../../src/services/auth.service";
import { MensagemEmail } from "../../src/types/email.types";

// rounds baixo de propósito: bcrypt com custo real deixaria a suíte lenta.
const ROUNDS = 4;
const URL_PUBLICA = "https://bodia.teste";

function repositorioFake(usuarioExiste: boolean, senhaHash: string) {
    const usuario = {
        id: "usuario-1",
        nome: "Ana",
        sobrenome: "Silva",
        email: "ana@teste.com",
    };

    return {
        buscarPorEmail: jest.fn().mockResolvedValue(usuarioExiste ? { ...usuario, senhaHash } : null),
        buscarSenhaHash: jest.fn().mockResolvedValue(usuarioExiste ? senhaHash : null),
        atualizarSenha: jest.fn().mockResolvedValue(usuario),
    } as unknown as UserRepository & {
        buscarPorEmail: jest.Mock;
        buscarSenhaHash: jest.Mock;
        atualizarSenha: jest.Mock;
    };
}

function redefinicaoFake({ ultimaSolicitacaoEm = null as Date | null, consumido = true } = {}) {
    return {
        ultimaSolicitacaoEm: jest.fn().mockResolvedValue(ultimaSolicitacaoEm),
        substituir: jest.fn().mockResolvedValue(undefined),
        consumirERedefinir: jest.fn().mockResolvedValue(consumido),
    } as unknown as RedefinicaoSenhaRepository & {
        ultimaSolicitacaoEm: jest.Mock;
        substituir: jest.Mock;
        consumirERedefinir: jest.Mock;
    };
}

function enviadorFake() {
    return { enviar: jest.fn<Promise<void>, [MensagemEmail]>().mockResolvedValue(undefined) };
}

function novoService(
    repository = repositorioFake(false, ""),
    redefinicao = redefinicaoFake(),
    enviador = enviadorFake(),
) {
    return new AuthService(repository, redefinicao, enviador, ROUNDS, URL_PUBLICA);
}

async function montar(usuarioExiste = true, opcoesRedefinicao = {}) {
    // O hash é gerado pelo próprio service — é o mesmo caminho que o cadastro
    // usa para gravar, então o teste prova que gravar e conferir combinam.
    const senhaHash = await novoService().gerarHash("12345678");
    const repository = repositorioFake(usuarioExiste, senhaHash);
    const redefinicao = redefinicaoFake(opcoesRedefinicao);
    const enviador = enviadorFake();

    return {
        repository,
        redefinicao,
        enviador,
        service: novoService(repository, redefinicao, enviador),
    };
}

/** O token que foi no link do e-mail enviado. */
function tokenDoLink(enviador: ReturnType<typeof enviadorFake>): string {
    const { texto } = enviador.enviar.mock.calls[0][0];
    const [, token] = /#token=([A-Za-z0-9_-]+)/.exec(texto) ?? [];

    return token;
}

describe("AuthService", () => {
    describe("gerarHash", () => {
        it("nunca devolve a senha em texto", async () => {
            const service = novoService();

            const hash = await service.gerarHash("12345678");

            expect(hash).not.toContain("12345678");
            expect(hash.startsWith("$2")).toBe(true);
        });

        it("gera hashes diferentes para a mesma senha", async () => {
            const service = novoService();

            const [a, b] = await Promise.all([
                service.gerarHash("12345678"),
                service.gerarHash("12345678"),
            ]);

            expect(a).not.toBe(b);
        });
    });

    describe("entrar", () => {
        it("devolve os dados do usuário quando a senha está certa", async () => {
            const { service } = await montar();

            const sessao = await service.entrar({ email: "ana@teste.com", senha: "12345678" });

            expect(sessao.usuario).toEqual({
                usuarioId: "usuario-1",
                nome: "Ana",
                sobrenome: "Silva",
                email: "ana@teste.com",
            });
        });

        // O token é conferido decodificando, e não comparando com uma string
        // esperada: a assinatura muda a cada emissão (o `iat` entra nela).
        it("emite um token que identifica o usuário", async () => {
            const { service } = await montar();

            const { token } = await service.entrar({ email: "ana@teste.com", senha: "12345678" });

            expect(lerToken(token)?.usuarioId).toBe("usuario-1");
        });

        // Nome e e-mail no payload ficariam legíveis por qualquer um que
        // decodificasse o token — a assinatura protege contra adulteração, não
        // contra leitura.
        it("não carrega dado pessoal dentro do token", async () => {
            const { service } = await montar();

            const { token } = await service.entrar({ email: "ana@teste.com", senha: "12345678" });
            const payload = JSON.parse(
                Buffer.from(token.split(".")[1], "base64").toString("utf8"),
            );

            expect(payload).not.toHaveProperty("nome");
            expect(payload).not.toHaveProperty("email");
        });

        it("recusa credencial ausente sem consultar o banco", async () => {
            const { service, repository } = await montar();

            await expect(
                service.entrar({ email: undefined as unknown as string, senha: "12345678" }),
            ).rejects.toThrow(AutenticacaoError);
            expect(repository.buscarPorEmail).not.toHaveBeenCalled();
        });

        it("nunca devolve o hash da senha", async () => {
            const { service } = await montar();

            const sessao = await service.entrar({ email: "ana@teste.com", senha: "12345678" });

            expect(JSON.stringify(sessao)).not.toContain("$2b$");
        });

        it("recusa senha errada", async () => {
            const { service } = await montar();

            await expect(
                service.entrar({ email: "ana@teste.com", senha: "errada" }),
            ).rejects.toThrow(AutenticacaoError);
        });

        // Mensagens diferentes transformariam a resposta num oráculo de quais
        // e-mails estão cadastrados.
        it("dá a MESMA mensagem para senha errada e e-mail inexistente", async () => {
            const comUsuario = await montar(true);
            const semUsuario = await montar(false);

            const erroSenha = await comUsuario.service
                .entrar({ email: "ana@teste.com", senha: "errada" })
                .catch((e) => e.message);
            const erroEmail = await semUsuario.service
                .entrar({ email: "naoexiste@teste.com", senha: "12345678" })
                .catch((e) => e.message);

            expect(erroSenha).toBe(erroEmail);
        });
    });
    describe("solicitarRedefinicao", () => {
        it("envia ao e-mail cadastrado um link com o token no fragmento", async () => {
            const { service, enviador } = await montar();

            await service.solicitarRedefinicao("ana@teste.com");

            expect(enviador.enviar).toHaveBeenCalledTimes(1);
            const mensagem = enviador.enviar.mock.calls[0][0];
            expect(mensagem.para).toBe("ana@teste.com");
            // No fragmento (#), e não na query (?): o navegador não manda o
            // fragmento ao servidor, então o token não fica no log do nginx.
            expect(mensagem.texto).toContain(`${URL_PUBLICA}/redefinir-senha#token=`);
            expect(mensagem.html).toContain(tokenDoLink(enviador));
        });

        // Quem lê o banco não pode montar um link válido.
        it("grava só o SHA-256 do token, nunca o token", async () => {
            const { service, enviador, redefinicao } = await montar();

            await service.solicitarRedefinicao("ana@teste.com");

            const token = tokenDoLink(enviador);
            const [usuarioId, tokenHash, expiraEm] = redefinicao.substituir.mock.calls[0];
            expect(usuarioId).toBe("usuario-1");
            expect(tokenHash).not.toBe(token);
            expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));

            const minutos = (expiraEm.getTime() - Date.now()) / 60000;
            expect(minutos).toBeGreaterThan(29);
            expect(minutos).toBeLessThanOrEqual(30);
        });

        it("gera um token diferente a cada pedido", async () => {
            const primeiro = await montar();
            const segundo = await montar();

            await primeiro.service.solicitarRedefinicao("ana@teste.com");
            await segundo.service.solicitarRedefinicao("ana@teste.com");

            expect(tokenDoLink(primeiro.enviador)).not.toBe(tokenDoLink(segundo.enviador));
        });

        // A rota responde igual nos dois casos; o service não pode deixar rastro
        // (token gravado, e-mail enviado) que diferencie um do outro.
        it("não cria token nem envia nada para e-mail desconhecido", async () => {
            const { service, enviador, redefinicao } = await montar(false);

            await service.solicitarRedefinicao("naoexiste@teste.com");

            expect(redefinicao.substituir).not.toHaveBeenCalled();
            expect(enviador.enviar).not.toHaveBeenCalled();
        });

        it.each([undefined, "", "   ", 42])("ignora e-mail ausente ou inválido (%p) sem consultar o banco", async (email) => {
            const { service, repository, enviador } = await montar();

            await service.solicitarRedefinicao(email);

            expect(repository.buscarPorEmail).not.toHaveBeenCalled();
            expect(enviador.enviar).not.toHaveBeenCalled();
        });

        it("não reenvia dentro do intervalo mínimo", async () => {
            const { service, enviador, redefinicao } = await montar(true, {
                ultimaSolicitacaoEm: new Date(Date.now() - 10_000),
            });

            await service.solicitarRedefinicao("ana@teste.com");

            expect(redefinicao.substituir).not.toHaveBeenCalled();
            expect(enviador.enviar).not.toHaveBeenCalled();
        });

        it("reenvia depois do intervalo mínimo", async () => {
            const { service, enviador } = await montar(true, {
                ultimaSolicitacaoEm: new Date(Date.now() - 5 * 60_000),
            });

            await service.solicitarRedefinicao("ana@teste.com");

            expect(enviador.enviar).toHaveBeenCalledTimes(1);
        });
    });

    describe("redefinirSenha", () => {
        const pedido = { token: "token-do-link", novaSenha: "senha-nova-1", confirmacao: "senha-nova-1" };

        it("consome o link pelo hash e grava o hash da senha nova", async () => {
            const { service, redefinicao } = await montar();

            await service.redefinirSenha(pedido);

            const [tokenHash, senhaHash] = redefinicao.consumirERedefinir.mock.calls[0];
            expect(tokenHash).toBe(createHash("sha256").update("token-do-link").digest("hex"));
            expect(senhaHash).not.toContain("senha-nova-1");
            expect(senhaHash.startsWith("$2")).toBe(true);
        });

        // "Não existe", "já usado" e "expirado" chegam aqui do mesmo jeito: o
        // repository devolve false.
        it("recusa link inválido, já usado ou expirado", async () => {
            const { service } = await montar(true, { consumido: false });

            await expect(service.redefinirSenha(pedido)).rejects.toThrow(ValidationError);
            await expect(service.redefinirSenha(pedido)).rejects.toThrow(/inválido ou expirado/);
        });

        it.each([
            ["curta", { novaSenha: "1234567", confirmacao: "1234567" }, /pelo menos 8/],
            ["diferente da confirmação", { confirmacao: "outra-senha-1" }, /não conferem/],
            ["sem token", { token: "" }, /inválido ou expirado/],
        ])("recusa senha %s antes de tocar o banco", async (_caso, alteracao, mensagem) => {
            const { service, redefinicao } = await montar();

            await expect(service.redefinirSenha({ ...pedido, ...alteracao })).rejects.toThrow(mensagem);
            expect(redefinicao.consumirERedefinir).not.toHaveBeenCalled();
        });
    });

    describe("alterarSenha", () => {
        const pedido = { senhaAtual: "12345678", novaSenha: "senha-nova-1", confirmacao: "senha-nova-1" };

        it("grava a senha nova e devolve uma sessão nova", async () => {
            const { service, repository } = await montar();

            const sessao = await service.alterarSenha("usuario-1", pedido);

            const [usuarioId, senhaHash, agora] = repository.atualizarSenha.mock.calls[0];
            expect(usuarioId).toBe("usuario-1");
            expect(senhaHash).not.toContain("senha-nova-1");
            expect(agora).toBeInstanceOf(Date);
            // O token devolvido precisa ser emitido DEPOIS da troca, senão o
            // próprio middleware o recusaria.
            const lido = lerToken(sessao.token);
            expect(lido?.usuarioId).toBe("usuario-1");
            expect(lido!.emitidoEmSeg).toBeGreaterThanOrEqual(Math.floor(agora.getTime() / 1000));
        });

        // 401 derrubaria a sessão no app: o interceptor desloga em qualquer 401
        // recebido com token.
        it("recusa senha atual errada com ValidationError, não AutenticacaoError", async () => {
            const { service, repository } = await montar();

            const erro = await service.alterarSenha("usuario-1", { ...pedido, senhaAtual: "errada" }).catch((e) => e);

            expect(erro).toBeInstanceOf(ValidationError);
            expect(erro).not.toBeInstanceOf(AutenticacaoError);
            expect(repository.atualizarSenha).not.toHaveBeenCalled();
        });

        it("recusa nova senha igual à atual", async () => {
            const { service } = await montar();

            await expect(
                service.alterarSenha("usuario-1", { ...pedido, novaSenha: "12345678", confirmacao: "12345678" }),
            ).rejects.toThrow(/diferente da atual/);
        });

        it.each([
            ["curta", { novaSenha: "1234567", confirmacao: "1234567" }],
            ["diferente da confirmação", { confirmacao: "outra-senha-1" }],
        ])("recusa nova senha %s sem conferir a atual", async (_caso, alteracao) => {
            const { service, repository } = await montar();

            await expect(service.alterarSenha("usuario-1", { ...pedido, ...alteracao })).rejects.toThrow(
                ValidationError,
            );
            expect(repository.buscarSenhaHash).not.toHaveBeenCalled();
        });
    });
});
