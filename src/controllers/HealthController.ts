import { Request, Response } from "express";

import HealthService from "../services/HealthService";

export default class HealthController {
    private readonly healthService;

    constructor(healthService: HealthService) {
        this.healthService = healthService;
    }

    check = (req: Request, res: Response) => {
        res.json(this.healthService.check());
    };
}
