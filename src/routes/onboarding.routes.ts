import { Router } from "express";

import OnboardingController from "../controllers/OnboardingController";
import CalculoService from "../services/CalculoService";
import OnboardingService from "../services/OnboardingService";

const router = Router();
const onboardingController = new OnboardingController(
    new OnboardingService(new CalculoService()),
);

router.post("/onboarding", onboardingController.receber);

export default router;
