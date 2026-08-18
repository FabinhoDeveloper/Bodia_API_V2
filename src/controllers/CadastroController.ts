import { NextFunction, Request, Response } from "express";

import CadastroService from "../services/CadastroService";
import { CadastroRequest } from "../types/plano.types";

/**
 * Ponte HTTP da confirmação do cadastro. Sem regra de negócio — e com
 * `.catch(next)` porque o Express 4 não encaminha rejeição de Promise sozinho.
 */
export default class CadastroController {
    private readonly cadastroService;

    constructor(cadastroService: CadastroService) {
        this.cadastroService = cadastroService;
    }

    cadastrar = (req: Request, res: Response, next: NextFunction) => {
        this.cadastroService
            .cadastrar(req.body as CadastroRequest)
            .then((resultado) => res.status(201).json(resultado))
            .catch(next);
    };
}
