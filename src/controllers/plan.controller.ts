import { NextFunction, Request, Response } from "express";

import PlanService from "../services/plan.service";
import { OnboardingRequest } from "../types/plano.types";

/**
 * Ponte HTTP do plano: lê req.body/req.params, repassa para o PlanService e
 * escreve a resposta. Não tem regra de negócio.
 */
export default class PlanController {
    private readonly planService;

    constructor(planService: PlanService) {
        this.planService = planService;
    }

    // O Express 4 não encaminha rejeições de Promise para o errorHandler sozinho.
    gerar = (req: Request, res: Response, next: NextFunction) => {
        this.planService
            .gerar(req.body as OnboardingRequest)
            .then((resultado) => res.json(resultado))
            .catch(next);
    };

    /**
     * O usuarioId vem da URL porque ainda não há JWT — é uma limitação
     * conhecida: quem descobrir um id lê o plano alheio. Sai quando a
     * autenticação entrar.
     */
    buscar = (req: Request, res: Response, next: NextFunction) => {
        this.planService
            .consultar(req.params.usuarioId)
            .then((plano) => res.json(plano))
            .catch(next);
    };
}
