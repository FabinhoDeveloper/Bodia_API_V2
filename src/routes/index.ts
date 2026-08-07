import { Router } from "express";

import cadastroRoutes from "./cadastro.routes";
import healthRoutes from "./health.routes";
import onboardingRoutes from "./onboarding.routes";
import usuarioRoutes from "./usuario.routes";

const router = Router();

router.use(healthRoutes);
router.use(onboardingRoutes);
router.use(cadastroRoutes);
router.use(usuarioRoutes);

export default router;
