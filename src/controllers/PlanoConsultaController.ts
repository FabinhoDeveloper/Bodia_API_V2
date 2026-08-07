import { NextFunction, Request, Response } from "express";

import PlanoConsultaService from "../services/PlanoConsultaService";

/**
 * Ponte HTTP da consulta do plano.
 *
 * O usuarioId vem da URL porque ainda não há JWT — é uma limitação conhecida:
 * quem descobrir um id lê o plano alheio. Sai quando a autenticação entrar.
 */
export default class PlanoConsultaController {
    private readonly planoConsultaService;

    constructor(planoConsultaService: PlanoConsultaService) {
        this.planoConsultaService = planoConsultaService;
    }

    buscar = (req: Request, res: Response, next: NextFunction) => {
        this.planoConsultaService
            .buscar(req.params.usuarioId)
            .then((plano) => res.json(plano))
            .catch(next);
    };
}
