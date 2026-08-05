import { Request, Response } from "express";

import HealthService from "../services/HealthService";

/**
 * Ponte HTTP do health check (GET /api/health): chama o HealthService e
 * devolve o resultado como JSON. Não tem regra de negócio.
 */
export default class HealthController {
    private readonly healthService;

    constructor(healthService: HealthService) {
        this.healthService = healthService;
    }

    check = (req: Request, res: Response) => {
        res.json(this.healthService.check());
    };
}
