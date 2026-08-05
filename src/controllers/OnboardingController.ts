import { Request, Response } from "express";

import OnboardingService, { CadastroInput } from "../services/OnboardingService";

export default class OnboardingController {
    private readonly onboardingService;

    constructor(onboardingService: OnboardingService) {
        this.onboardingService = onboardingService;
    }

    receber = (req: Request, res: Response) => {
        res.json(this.onboardingService.receberCadastro(req.body as CadastroInput));
    };
}
