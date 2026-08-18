import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import CadastroController from "../controllers/CadastroController";
import UserRepository from "../repositories/user.repository";
import CadastroService from "../services/CadastroService";
import EngineService from "../services/engine.service";
import SenhaService from "../services/SenhaService";

const router = Router();

const cadastroController = new CadastroController(
    new CadastroService(
        new UserRepository(prismaClient),
        new EngineService(),
        new SenhaService(bcryptRounds),
    ),
);

router.post("/cadastro", cadastroController.cadastrar);

export default router;
