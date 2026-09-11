import { Router } from "express";

import { PAGINA_REDEFINIR_SENHA } from "../paginas/redefinir-senha.pagina";

/**
 * Páginas HTML — montado na RAIZ em app.ts, fora de `/api`, que continua só JSON.
 *
 * Hoje é uma só: a que o link de redefinição de senha abre (RF03).
 */
const router = Router();

/**
 * CSP própria desta página (a global está desligada em app.ts, porque a API só
 * devolve JSON). O script é inline, então precisa de `'unsafe-inline'` — o
 * risco é pequeno, porque nada vindo do usuário é interpolado no HTML.
 *
 * `form-action 'none'` importa: se o JS falhar, o envio nativo do formulário
 * mandaria a senha na URL; assim o navegador o bloqueia.
 */
const CSP = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
].join("; ");

router.get("/redefinir-senha", (_req, res) => {
    res.set({
        "Content-Security-Policy": CSP,
        // A página não tem nada pessoal, mas não há motivo para um proxy guardá-la.
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
    })
        .type("html")
        .send(PAGINA_REDEFINIR_SENHA);
});

export default router;
