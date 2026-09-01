import { lerToken } from "../../src/config/jwt";
import AutenticacaoError from "../../src/errors/autenticacao.error";
import UserRepository from "../../src/repositories/user.repository";
import AuthService from "../../src/services/auth.service";

// rounds baixo de propósito: bcrypt com custo real deixaria a suíte lenta.
const ROUNDS = 4;

function repositorioFake(usuarioExiste: boolean, senhaHash: string) {
    return {
        buscarPorEmail: jest.fn().mockResolvedValue(
            usuarioExiste
                ? {
                      id: "usuario-1",
                      nome: "Ana",
                      sobrenome: "Silva",
                      email: "ana@teste.com",
                      senhaHash,
                  }
                : null,
        ),
    } as unknown as UserRepository & { buscarPorEmail: jest.Mock };
}

async function montar(usuarioExiste = true) {
    // O hash é gerado pelo próprio service — é o mesmo caminho que o cadastro
    // usa para gravar, então o teste prova que gravar e conferir combinam.
    const gerador = new AuthService(repositorioFake(false, ""), ROUNDS);
    const senhaHash = await gerador.gerarHash("12345678");
    const repository = repositorioFake(usuarioExiste, senhaHash);

    return { repository, service: new AuthService(repository, ROUNDS) };
}

describe("AuthService", () => {
    describe("gerarHash", () => {
        it("nunca devolve a senha em texto", async () => {
            const service = new AuthService(repositorioFake(false, ""), ROUNDS);

            const hash = await service.gerarHash("12345678");

            expect(hash).not.toContain("12345678");
            expect(hash.startsWith("$2")).toBe(true);
        });

        it("gera hashes diferentes para a mesma senha", async () => {
            const service = new AuthService(repositorioFake(false, ""), ROUNDS);

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

            expect(lerToken(token)).toBe("usuario-1");
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
});
