import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import AuthController from "../controllers/auth.controller";
import UserRepository from "../repositories/user.repository";
import AuthService from "../services/auth.service";

const router = Router();

const authController = new AuthController(
    new AuthService(new UserRepository(prismaClient), bcryptRounds),
);

router.post("/login", authController.entrar);

export default router;
