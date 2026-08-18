import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import AuthController from "../controllers/auth.controller";
import PerfilMapper from "../mappers/perfil.mapper";
import UserRepository from "../repositories/user.repository";
import AuthService from "../services/auth.service";

const router = Router();

const authController = new AuthController(
    new AuthService(new UserRepository(prismaClient, new PerfilMapper()), bcryptRounds),
);

router.post("/login", authController.entrar);

export default router;
