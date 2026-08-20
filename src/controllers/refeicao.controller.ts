import { NextFunction, Request, Response } from "express";

import { interpretarDia } from "../config/fuso";
import ValidationError from "../errors/validation.error";
import RefeicaoService from "../services/refeicao.service";

/**
 * Ponte HTTP da refeição registrada. Sem regra de negócio: a posse do
 * refeicaoId, a idempotência e o recorte do dia moram no service.
 *
 * O usuarioId vem do corpo/URL porque ainda não há JWT — mesma limitação já
 * documentada na hidratação: sem token, dá para escrever e apagar no histórico
 * alheio.
 */
export default class RefeicaoController {
    private readonly refeicaoService;

    constructor(refeicaoService: RefeicaoService) {
        this.refeicaoService = refeicaoService;
    }

    // O Express 4 não encaminha rejeições de Promise para o errorHandler sozinho.
    registrar = (req: Request, res: Response, next: NextFunction) => {
        const { usuarioId, refeicaoId } = req.body ?? {};

        this.refeicaoService
            .registrar(usuarioId, refeicaoId)
            .then((resumo) => res.status(201).json(resumo))
            .catch(next);
    };

    /** `?dia=AAAA-MM-DD` é opcional — sem ele, hoje. */
    buscar = (req: Request, res: Response, next: NextFunction) => {
        const { dia } = req.query;

        let instante = new Date();

        if (typeof dia === "string") {
            const interpretado = interpretarDia(dia);

            if (!interpretado) {
                next(new ValidationError("dia deve estar no formato AAAA-MM-DD"));
                return;
            }

            instante = interpretado;
        }

        this.refeicaoService
            .doDia(req.params.usuarioId, instante)
            .then((resumo) => res.json(resumo))
            .catch(next);
    };

    remover = (req: Request, res: Response, next: NextFunction) => {
        this.refeicaoService
            .remover(req.params.usuarioId, req.params.refeicaoId)
            .then((resumo) => res.json(resumo))
            .catch(next);
    };
}
