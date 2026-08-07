import { NextFunction, Request, Response } from "express";

import CadastroService, { CadastroInput } from "../services/CadastroService";

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
            .cadastrar(req.body as CadastroInput)
            .then((resultado) => res.status(201).json(resultado))
            .catch(next);
    };
}
