import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import CadastroController from "../controllers/CadastroController";
import UserRepository from "../repositories/user.repository";
import AuthService from "../services/auth.service";
import CadastroService from "../services/CadastroService";
import EngineService from "../services/engine.service";

const router = Router();

const userRepository = new UserRepository(prismaClient);

const cadastroController = new CadastroController(
    new CadastroService(
        userRepository,
        new EngineService(),
        new AuthService(userRepository, bcryptRounds),
    ),
);

router.post("/cadastro", cadastroController.cadastrar);

export default router;
