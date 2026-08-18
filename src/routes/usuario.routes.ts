import { Router } from "express";

import prismaClient from "../config/prisma";
import PlanoConsultaController from "../controllers/PlanoConsultaController";
import PlanRepository from "../repositories/plan.repository";
import PlanoConsultaService from "../services/PlanoConsultaService";

const router = Router();

const planoConsultaController = new PlanoConsultaController(
    new PlanoConsultaService(new PlanRepository(prismaClient)),
);

router.get("/plano/:usuarioId", planoConsultaController.buscar);

export default router;
