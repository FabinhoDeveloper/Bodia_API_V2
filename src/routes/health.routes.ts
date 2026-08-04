import { Router } from "express";

import HealthController from "../controllers/HealthController";
import HealthService from "../services/HealthService";

const router = Router();
const healthController = new HealthController(new HealthService());

router.get("/health", healthController.check);

export default router;
