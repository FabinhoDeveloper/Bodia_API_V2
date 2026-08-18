import { Router } from "express";

import benchmarkRoutes from "../benchmark/benchmark.routes";
import authRoutes from "./auth.routes";
import planRoutes from "./plan.routes";
import userRoutes from "./user.routes";

const router = Router();

router.use(planRoutes);
router.use(userRoutes);
router.use(authRoutes);
// Endpoint temporário de benchmark (GET /api/teste-geracao) — ver
// src/benchmark/benchmark.routes.ts.
router.use(benchmarkRoutes);

export default router;
