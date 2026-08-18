import { Router } from "express";

import benchmarkRoutes from "../benchmark/benchmark.routes";
import cadastroRoutes from "./cadastro.routes";
import onboardingRoutes from "./onboarding.routes";
import usuarioRoutes from "./usuario.routes";

const router = Router();

router.use(onboardingRoutes);
router.use(cadastroRoutes);
router.use(usuarioRoutes);
// Endpoint temporário de benchmark (GET /api/teste-geracao) — ver
// src/routes/benchmark.routes.ts.
router.use(benchmarkRoutes);

export default router;
