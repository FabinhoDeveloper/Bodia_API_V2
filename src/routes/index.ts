import { Router } from "express";

import cadastroRoutes from "./cadastro.routes";
import healthRoutes from "./health.routes";
import onboardingRoutes from "./onboarding.routes";

const router = Router();

router.use(healthRoutes);
router.use(onboardingRoutes);
router.use(cadastroRoutes);

export default router;
