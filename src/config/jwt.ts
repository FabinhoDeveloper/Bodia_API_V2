import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

/**
 * Emissão e leitura do token de sessão.
 *
 * Fica em config/ pelo mesmo motivo de fuso.ts: o segredo e o prazo são
 * característica do AMBIENTE, não regra de domínio, e a regra do projeto é que
 * `process.env` só seja lido em `server.ts` e em `config/`. Assim o segredo
 * nunca sai daqui — nem o service nem o middleware o enxergam, os dois só
 * chamam as funções abaixo.
 *
 * O payload carrega SÓ o `sub` (o id do usuário). Nome, e-mail e objetivo
 * ficariam legíveis por qualquer um que decodificasse o token (a assinatura
 * protege contra adulteração, não contra leitura) e, pior, virariam uma cópia
 * desatualizada assim que o usuário editasse o perfil.
 */

const segredo = process.env.JWT_SECRET ?? "";

/**
 * Sete dias. É o prazo em que o app reabre já logado sem pedir senha de novo;
 * passado ele, o interceptor do mobile recebe 401 e manda para o login.
 */
// O cast existe porque os tipos do jsonwebtoken exigem um template literal
// ("7d", "12h", ...) que nenhuma string vinda de `process.env` consegue provar
// em tempo de compilação. Um valor inválido falha na assinatura, no boot da
// primeira rota autenticada — não silenciosamente.
export const jwtExpiraEm = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];

/**
 * Sem segredo o servidor SOBE, e só as rotas autenticadas falham — mesma
 * decisão do cliente de IA por factory (`getIaClient`). Derrubar o boot por uma
 * variável ausente deixaria o desenvolvedor sem nem a rota `/` para descobrir o
 * que houve.
 */
function exigirSegredo(): string {
    if (!segredo) {
        throw new Error("JWT_SECRET não configurado — defina no .env (ver .env.example)");
    }

    return segredo;
}

export function assinarToken(usuarioId: string): string {
    return jwt.sign({}, exigirSegredo(), { subject: usuarioId, expiresIn: jwtExpiraEm });
}

/**
 * Devolve o id do usuário, ou `null` para token ausente, expirado, adulterado
 * ou assinado com outro segredo.
 *
 * Não distingue os casos de propósito: quem chama responde 401 em todos, e um
 * "token expirado" contra "token inválido" só serviria para dizer a um atacante
 * que ele acertou a assinatura.
 */
export function lerToken(token: string): string | null {
    try {
        const payload = jwt.verify(token, exigirSegredo()) as JwtPayload;

        return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
        return null;
    }
}
