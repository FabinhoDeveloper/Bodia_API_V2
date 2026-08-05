import { Router } from "express";

import { deepseekModel, getDeepseekClient } from "../config/deepseek";
import OnboardingController from "../controllers/OnboardingController";
import CalculoService from "../services/CalculoService";
import LlmService from "../services/LlmService";
import OnboardingService from "../services/OnboardingService";

const router = Router();
const onboardingController = new OnboardingController(
    new OnboardingService(new CalculoService(), new LlmService(getDeepseekClient, deepseekModel)),
);

router.post("/onboarding", onboardingController.receber);

export default router;
