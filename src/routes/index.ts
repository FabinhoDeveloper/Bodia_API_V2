import { Router } from "express";

import benchmarkRoutes from "../benchmark/benchmark.routes";
import authRoutes from "./auth.routes";
import cadastroRoutes from "./cadastro.routes";
import planRoutes from "./plan.routes";

const router = Router();

router.use(planRoutes);
router.use(cadastroRoutes);
router.use(authRoutes);
// Endpoint temporário de benchmark (GET /api/teste-geracao) — ver
// src/routes/benchmark.routes.ts.
router.use(benchmarkRoutes);

export default router;
