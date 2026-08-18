import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import LoginController from "../controllers/LoginController";
import PlanoConsultaController from "../controllers/PlanoConsultaController";
import UserRepository from "../repositories/user.repository";
import PlanRepository from "../repositories/plan.repository";
import LoginService from "../services/LoginService";
import PlanoConsultaService from "../services/PlanoConsultaService";
import SenhaService from "../services/SenhaService";

const router = Router();

const loginController = new LoginController(
    new LoginService(new UserRepository(prismaClient), new SenhaService(bcryptRounds)),
);

const planoConsultaController = new PlanoConsultaController(
    new PlanoConsultaService(new PlanRepository(prismaClient)),
);

router.post("/login", loginController.entrar);
router.get("/plano/:usuarioId", planoConsultaController.buscar);

export default router;
