import { Router } from "express";

import healthRoutes from "./health.routes";
import onboardingRoutes from "./onboarding.routes";

const router = Router();

router.use(healthRoutes);
router.use(onboardingRoutes);

export default router;
