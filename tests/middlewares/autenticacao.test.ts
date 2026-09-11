import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { assinarToken } from "../../src/config/jwt";
import AutenticacaoError from "../../src/errors/autenticacao.error";
import { criarAutenticacao } from "../../src/middlewares/autenticacao";

/** Assina com um `iat` escolhido — o que `assinarToken` não deixa fazer. */
function tokenEmitidoEm(segundos: number): string {
    return jwt.sign({ iat: segundos }, process.env.JWT_SECRET!, { subject: "usuario-1", expiresIn: "7d" });
}

/** Roda o middleware e devolve o que ele passou ao `next` e o id injetado. */
function executar(token: string | null, senhaAlteradaEm: Date | null | undefined) {
    const repository = { buscarSenhaAlteradaEm: jest.fn().mockResolvedValue(senhaAlteradaEm) };
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} } as Request;

    return new Promise<{ erro: unknown; usuarioId?: string; repository: typeof repository }>((resolve) => {
        const next: NextFunction = (erro?: unknown) => resolve({ erro, usuarioId: req.usuarioId, repository });

        criarAutenticacao(repository)(req, {} as Response, next);
    });
}

describe("autenticacao", () => {
    const agoraSeg = Math.floor(Date.now() / 1000);

    it("deixa passar quem nunca trocou a senha e injeta o usuarioId", async () => {
        const { erro, usuarioId } = await executar(assinarToken("usuario-1"), null);

        expect(erro).toBeUndefined();
        expect(usuarioId).toBe("usuario-1");
    });

    // É o que faz redefinir a senha expulsar quem estava logado com a antiga.
    it("recusa token emitido antes da última troca de senha", async () => {
        const { erro, usuarioId } = await executar(
            tokenEmitidoEm(agoraSeg - 3600),
            new Date((agoraSeg - 60) * 1000),
        );

        expect(erro).toBeInstanceOf(AutenticacaoError);
        expect(usuarioId).toBeUndefined();
    });

    it("aceita token emitido depois da troca", async () => {
        const { erro } = await executar(tokenEmitidoEm(agoraSeg), new Date((agoraSeg - 60) * 1000));

        expect(erro).toBeUndefined();
    });

    // O `iat` é truncado no segundo. O token que a própria troca devolve sai
    // milissegundos depois dela, e compará-lo em ms o recusaria.
    it("aceita token emitido no mesmo segundo da troca", async () => {
        const { erro } = await executar(tokenEmitidoEm(agoraSeg), new Date(agoraSeg * 1000 + 800));

        expect(erro).toBeUndefined();
    });

    it("recusa token de usuário que não existe mais", async () => {
        const { erro } = await executar(assinarToken("usuario-1"), undefined);

        expect(erro).toBeInstanceOf(AutenticacaoError);
    });

    it("recusa sem consultar o banco quando não há token", async () => {
        const { erro, repository } = await executar(null, null);

        expect(erro).toBeInstanceOf(AutenticacaoError);
        expect(repository.buscarSenhaAlteradaEm).not.toHaveBeenCalled();
    });

    it("recusa sem consultar o banco quando a assinatura não fecha", async () => {
        const { erro, repository } = await executar("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.falsa", null);

        expect(erro).toBeInstanceOf(AutenticacaoError);
        expect(repository.buscarSenhaAlteradaEm).not.toHaveBeenCalled();
    });

    // Banco fora do ar vira 500 pelo errorHandler, e não requisição pendurada.
    it("repassa ao next a falha do banco", async () => {
        const falha = new Error("banco fora do ar");
        const repository = { buscarSenhaAlteradaEm: jest.fn().mockRejectedValue(falha) };
        const req = { headers: { authorization: `Bearer ${assinarToken("usuario-1")}` } } as Request;

        const erro = await new Promise((resolve) => criarAutenticacao(repository)(req, {} as Response, resolve));

        expect(erro).toBe(falha);
    });
});
