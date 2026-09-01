import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import { limiteAutenticacao } from "../config/seguranca";
import UserController from "../controllers/user.controller";
import PerfilMapper from "../mappers/perfil.mapper";
import UserRepository from "../repositories/user.repository";
import AuthService from "../services/auth.service";
import EngineService from "../services/engine.service";
import UserService from "../services/user.service";

const router = Router();

const userRepository = new UserRepository(prismaClient, new PerfilMapper());

const userController = new UserController(
    new UserService(
        userRepository,
        new EngineService(),
        new AuthService(userRepository, bcryptRounds),
    ),
);

// Mesmo limite do login: o 409 de e-mail duplicado é um oráculo de quem já tem
// conta, e sem limite dá para varrer uma lista de e-mails com ele.
router.post("/cadastro", limiteAutenticacao, userController.cadastrar);

export default router;
