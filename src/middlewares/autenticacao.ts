import { NextFunction, Request, Response } from "express";

import { lerToken } from "../config/jwt";
import AutenticacaoError from "../errors/autenticacao.error";

/**
 * Exige `Authorization: Bearer <token>` e injeta `req.usuarioId`.
 *
 * É o que fechou o buraco descrito nos controllers de hidratação e refeição: o
 * `usuarioId` vinha do corpo e da URL, então qualquer um que descobrisse um id
 * lia, escrevia e apagava no histórico daquela pessoa. Agora o id vem do token
 * assinado, e o cliente não tem como escolher de quem ele é.
 *
 * Por isso o id saiu também das URLs (`/plano/:usuarioId` → `/plano`): mantê-lo
 * lá, mesmo conferido contra o token, deixaria dois lugares dizendo quem é o
 * dono — e um dia alguém confiaria no errado.
 */
export default function autenticacao(req: Request, _res: Response, next: NextFunction) {
    const cabecalho = req.headers.authorization ?? "";
    const [esquema, token] = cabecalho.split(" ");

    if (esquema !== "Bearer" || !token) {
        next(new AutenticacaoError("Autenticação necessária"));
        return;
    }

    const usuarioId = lerToken(token);

    if (!usuarioId) {
        next(new AutenticacaoError("Sessão inválida ou expirada"));
        return;
    }

    req.usuarioId = usuarioId;
    next();
}

/**
 * O id do usuário autenticado, garantido não-nulo.
 *
 * Existe porque `Express.Request.usuarioId` é opcional (ver types/express.d.ts):
 * sem esta função cada controller precisaria de um `!` — e um `!` errado manda
 * `undefined` para o `where` do Prisma, que não acha nada e devolve 404 em vez
 * de acusar o problema.
 */
export function usuarioAutenticado(req: Request): string {
    if (!req.usuarioId) {
        throw new AutenticacaoError("Autenticação necessária");
    }

    return req.usuarioId;
}
