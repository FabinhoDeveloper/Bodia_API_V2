import { NextFunction, Request, Response } from "express";

import { usuarioAutenticado } from "../middlewares/autenticacao";
import AuthService from "../services/auth.service";
import { AlteracaoSenhaInput, LoginInput, RedefinicaoSenhaInput } from "../types/auth.types";

/** Ponte HTTP da autenticação. Sem regra de negócio. */
export default class AuthController {
    private readonly authService;

    constructor(authService: AuthService) {
        this.authService = authService;
    }

    entrar = (req: Request, res: Response, next: NextFunction) => {
        this.authService
            .entrar(req.body as LoginInput)
            .then((usuario) => res.json(usuario))
            .catch(next);
    };

    /**
     * Responde ANTES de o service terminar, de propósito — é a única rota que
     * não espera.
     *
     * Para e-mail cadastrado o service grava o token e fala com o SMTP; para
     * e-mail desconhecido ele volta na hora. Esperando, o TEMPO de resposta diria
     * o que a mensagem esconde: quais e-mails têm conta. A falha do envio vai
     * para o log, já que o usuário não teria como agir sobre ela de qualquer jeito.
     */
    solicitarRedefinicao = (req: Request, res: Response) => {
        this.authService
            .solicitarRedefinicao(req.body?.email)
            .catch((erro) => console.error("[senha] falha ao enviar o link de redefinição", erro));

        res.status(202).json({
            message: "Se o e-mail estiver cadastrado, você receberá um link em alguns minutos.",
        });
    };

    redefinir = (req: Request, res: Response, next: NextFunction) => {
        this.authService
            .redefinirSenha((req.body ?? {}) as RedefinicaoSenhaInput)
            .then(() => res.status(204).send())
            .catch(next);
    };

    alterar = (req: Request, res: Response, next: NextFunction) => {
        this.authService
            .alterarSenha(usuarioAutenticado(req), (req.body ?? {}) as AlteracaoSenhaInput)
            .then((sessao) => res.json(sessao))
            .catch(next);
    };
}
