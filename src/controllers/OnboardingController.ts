import { NextFunction, Request, Response } from "express";

import OnboardingService, { CadastroInput } from "../services/OnboardingService";

export default class OnboardingController {
    private readonly onboardingService;

    constructor(onboardingService: OnboardingService) {
        this.onboardingService = onboardingService;
    }

    // O Express 4 não encaminha rejeições de Promise para o errorHandler sozinho.
    receber = (req: Request, res: Response, next: NextFunction) => {
        this.onboardingService
            .receberCadastro(req.body as CadastroInput)
            .then((resultado) => res.json(resultado))
            .catch(next);
    };
}
