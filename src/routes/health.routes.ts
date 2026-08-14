import { Router } from "express";

import HealthController from "../controllers/HealthController";

const router = Router();
const healthController = new HealthController();

router.get("/health", healthController.check);

export default router;
