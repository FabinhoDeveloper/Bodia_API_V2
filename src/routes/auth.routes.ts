import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import { limiteAutenticacao } from "../config/seguranca";
import AuthController from "../controllers/auth.controller";
import FichaMapper from "../mappers/ficha.mapper";
import PerfilMapper from "../mappers/perfil.mapper";
import UserRepository from "../repositories/user.repository";
import AuthService from "../services/auth.service";

const router = Router();

const authController = new AuthController(
    new AuthService(new UserRepository(prismaClient, new PerfilMapper(), new FichaMapper()), bcryptRounds),
);

// O limite estreito é o que sobra contra força bruta depois do bcrypt: sem ele,
// tentar milhares de senhas custaria só tempo de CPU do servidor.
router.post("/login", limiteAutenticacao, authController.entrar);

export default router;
