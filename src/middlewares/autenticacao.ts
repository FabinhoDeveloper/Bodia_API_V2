import { NextFunction, Request, Response } from "express";

import { lerToken } from "../config/jwt";
import prismaClient from "../config/prisma";
import AutenticacaoError from "../errors/autenticacao.error";
import FichaMapper from "../mappers/ficha.mapper";
import PerfilMapper from "../mappers/perfil.mapper";
import UserRepository from "../repositories/user.repository";

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
 *
 * A assinatura sozinha não basta mais: o token também é recusado se foi emitido
 * ANTES da última troca de senha (`Usuario.senhaAlteradaEm`). Sem isso, redefinir
 * a senha não expulsaria quem já estivesse logado com a antiga — que é o motivo
 * de alguém redefinir. Custa uma leitura por PK a cada requisição autenticada,
 * e de brinde recusa o token de uma conta que já foi excluída.
 *
 * Factory para os testes poderem passar um repository falso; o `default` abaixo
 * é a instância que as rotas usam.
 */
export function criarAutenticacao(userRepository: Pick<UserRepository, "buscarSenhaAlteradaEm">) {
    return (req: Request, _res: Response, next: NextFunction) => {
        const cabecalho = req.headers.authorization ?? "";
        const [esquema, token] = cabecalho.split(" ");

        if (esquema !== "Bearer" || !token) {
            next(new AutenticacaoError("Autenticação necessária"));
            return;
        }

        const lido = lerToken(token);

        if (!lido) {
            next(new AutenticacaoError("Sessão inválida ou expirada"));
            return;
        }

        // Express 4 não encaminha rejeição de Promise: sem o `.catch(next)`, um
        // banco fora do ar deixaria a requisição pendurada até o timeout.
        userRepository
            .buscarSenhaAlteradaEm(lido.usuarioId)
            .then((senhaAlteradaEm) => {
                if (senhaAlteradaEm === undefined || emitidoAntesDaTroca(lido.emitidoEmSeg, senhaAlteradaEm)) {
                    next(new AutenticacaoError("Sessão inválida ou expirada"));
                    return;
                }

                req.usuarioId = lido.usuarioId;
                next();
            })
            .catch(next);
    };
}

/**
 * Compara em SEGUNDOS, porque é essa a resolução do `iat`. Comparar em ms
 * recusaria o token novo que a própria troca de senha devolve: emitido 200 ms
 * depois dela, ele carrega o segundo truncado, que fica ANTES do instante exato
 * da troca.
 *
 * O preço é um token emitido no mesmo segundo, antes da troca, sobreviver — uma
 * janela de menos de um segundo, aceita.
 */
function emitidoAntesDaTroca(emitidoEmSeg: number, senhaAlteradaEm: Date | null): boolean {
    return senhaAlteradaEm !== null && emitidoEmSeg < Math.floor(senhaAlteradaEm.getTime() / 1000);
}

const autenticacao = criarAutenticacao(
    new UserRepository(prismaClient, new PerfilMapper(), new FichaMapper()),
);

export default autenticacao;

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
