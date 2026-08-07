import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import CadastroController from "../controllers/CadastroController";
import CadastroRepository from "../repositories/CadastroRepository";
import CadastroService from "../services/CadastroService";
import CalculoService from "../services/CalculoService";
import SenhaService from "../services/SenhaService";

const router = Router();

const cadastroController = new CadastroController(
    new CadastroService(
        new CadastroRepository(prismaClient),
        new CalculoService(),
        new SenhaService(bcryptRounds),
    ),
);

router.post("/cadastro", cadastroController.cadastrar);

export default router;
