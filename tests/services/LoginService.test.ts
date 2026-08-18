import AutenticacaoError from "../../src/errors/AutenticacaoError";
import UserRepository from "../../src/repositories/user.repository";
import LoginService from "../../src/services/LoginService";
import SenhaService from "../../src/services/SenhaService";

// rounds baixo de propósito: bcrypt com custo real deixaria a suíte lenta.
const senhaService = new SenhaService(4);

async function montar(usuarioExiste = true) {
    const senhaHash = await senhaService.gerarHash("12345678");
    const repository = {
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

    return { repository, service: new LoginService(repository, senhaService) };
}

describe("LoginService", () => {
    it("devolve os dados do usuário quando a senha está certa", async () => {
        const { service } = await montar();

        await expect(service.entrar({ email: "ana@teste.com", senha: "12345678" })).resolves.toEqual({
            usuarioId: "usuario-1",
            nome: "Ana",
            sobrenome: "Silva",
            email: "ana@teste.com",
        });
    });

    it("nunca devolve o hash da senha", async () => {
        const { service } = await montar();

        const usuario = await service.entrar({ email: "ana@teste.com", senha: "12345678" });

        expect(JSON.stringify(usuario)).not.toContain("$2b$");
    });

    it("recusa senha errada", async () => {
        const { service } = await montar();

        await expect(service.entrar({ email: "ana@teste.com", senha: "errada" })).rejects.toThrow(
            AutenticacaoError,
        );
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
