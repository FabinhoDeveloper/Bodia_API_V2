import { NextFunction, Request, Response } from "express";

import { usuarioAutenticado } from "../middlewares/autenticacao";
import UserService from "../services/user.service";
import { CadastroRequest } from "../types/plano.types";

/**
 * Ponte HTTP do domínio do usuário: confirmação do cadastro e registro de peso.
 *
 * Sem regra de negócio — e com `.catch(next)` porque o Express 4 não encaminha
 * rejeição de Promise sozinho.
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

    registrarPeso = (req: Request, res: Response, next: NextFunction) => {
        const { pesoKg } = req.body ?? {};

        this.userService
            .registrarPeso(usuarioAutenticado(req), pesoKg)
            .then((resumo) => res.status(201).json(resumo))
            .catch(next);
    };

    consultarPeso = (req: Request, res: Response, next: NextFunction) => {
        this.userService
            .consultarPeso(usuarioAutenticado(req))
            .then((resumo) => res.json(resumo))
            .catch(next);
    };
}
