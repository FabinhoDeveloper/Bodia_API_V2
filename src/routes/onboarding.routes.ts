import { Router } from "express";

import OnboardingController from "../controllers/OnboardingController";
import OnboardingService from "../services/OnboardingService";

const router = Router();
const onboardingController = new OnboardingController(new OnboardingService());

router.post("/onboarding", onboardingController.receber);

export default router;
