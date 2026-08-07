import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import LoginController from "../controllers/LoginController";
import PlanoConsultaController from "../controllers/PlanoConsultaController";
import CadastroRepository from "../repositories/CadastroRepository";
import PlanoConsultaRepository from "../repositories/PlanoConsultaRepository";
import LoginService from "../services/LoginService";
import PlanoConsultaService from "../services/PlanoConsultaService";
import SenhaService from "../services/SenhaService";

const router = Router();

const loginController = new LoginController(
    new LoginService(new CadastroRepository(prismaClient), new SenhaService(bcryptRounds)),
);

const planoConsultaController = new PlanoConsultaController(
    new PlanoConsultaService(new PlanoConsultaRepository(prismaClient)),
);

router.post("/login", loginController.entrar);
router.get("/plano/:usuarioId", planoConsultaController.buscar);

export default router;
