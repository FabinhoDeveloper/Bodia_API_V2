import { NextFunction, Request, Response } from "express";

import AuthService from "../services/auth.service";
import { LoginInput } from "../types/auth.types";

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
}
