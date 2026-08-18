import { NextFunction, Request, Response } from "express";

import UserService from "../services/user.service";
import { CadastroRequest } from "../types/plano.types";

/**
 * Ponte HTTP da confirmação do cadastro. Sem regra de negócio — e com
 * `.catch(next)` porque o Express 4 não encaminha rejeição de Promise sozinho.
 */
export default class UserController {
    private readonly userService;

    constructor(userService: UserService) {
        this.userService = userService;
    }

    cadastrar = (req: Request, res: Response, next: NextFunction) => {
        this.userService
            .cadastrar(req.body as CadastroRequest)
            .then((resultado) => res.status(201).json(resultado))
            .catch(next);
    };
}
