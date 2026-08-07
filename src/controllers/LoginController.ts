import { NextFunction, Request, Response } from "express";

import LoginService, { LoginInput } from "../services/LoginService";

/** Ponte HTTP do login. Sem regra de negócio. */
export default class LoginController {
    private readonly loginService;

    constructor(loginService: LoginService) {
        this.loginService = loginService;
    }

    entrar = (req: Request, res: Response, next: NextFunction) => {
        this.loginService
            .entrar(req.body as LoginInput)
            .then((usuario) => res.json(usuario))
            .catch(next);
    };
}
