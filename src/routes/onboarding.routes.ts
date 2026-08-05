import { Router } from "express";

import { deepseekModel, getDeepseekClient } from "../config/deepseek";
import OnboardingController from "../controllers/OnboardingController";
import CalculoService from "../services/CalculoService";
import CatalogoService from "../services/CatalogoService";
import LlmService from "../services/LlmService";
import OnboardingService from "../services/OnboardingService";
import PlanoService from "../services/PlanoService";
import PromptService from "../services/PromptService";

const router = Router();

const planoService = new PlanoService(
    new CatalogoService(),
    new PromptService(),
    new LlmService(getDeepseekClient, deepseekModel),
);

const onboardingController = new OnboardingController(
    new OnboardingService(new CalculoService(), planoService),
);

router.post("/onboarding", onboardingController.receber);

export default router;
