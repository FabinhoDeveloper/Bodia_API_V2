/**
 * `req.usuarioId` — preenchido pelo middleware de autenticação a partir do
 * token, e a única fonte de identidade do sistema.
 *
 * OPCIONAL de propósito: nem toda rota passa pelo middleware (login, cadastro e
 * onboarding são públicas), e declará-lo obrigatório faria o TypeScript afirmar
 * em todas elas algo que não é verdade. Quem precisa do id chama
 * `usuarioAutenticado(req)` (src/middlewares/autenticacao.ts), que devolve
 * `string` ou lança 401 — assim um `undefined` nunca chega ao repository
 * disfarçado de id válido.
 */
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            usuarioId?: string;
        }
    }
}

export {};
