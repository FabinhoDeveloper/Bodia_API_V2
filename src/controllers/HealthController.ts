import { Request, Response } from "express";

/**
 * Ponte HTTP do health check (GET /api/health): confirma que a API está de
 * pé. Não tem regra de negócio, então não precisa de Service.
 */
export default class HealthController {
    check = (req: Request, res: Response) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() });
    };
}
