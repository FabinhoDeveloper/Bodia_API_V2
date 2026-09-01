import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import { limiteAutenticacao } from "../config/seguranca";
import UserController from "../controllers/user.controller";
import PerfilMapper from "../mappers/perfil.mapper";
import autenticacao from "../middlewares/autenticacao";
import PesoRepository from "../repositories/peso.repository";
import PlanRepository from "../repositories/plan.repository";
import UserRepository from "../repositories/user.repository";
import AuthService from "../services/auth.service";
import EngineService from "../services/engine.service";
import UserService from "../services/user.service";

const router = Router();

const perfilMapper = new PerfilMapper();
const userRepository = new UserRepository(prismaClient, perfilMapper);

// O PlanRepository entra aqui pela ficha ativa: é nela que as metas
// recalculadas são gravadas quando o usuário registra um peso novo (RF34).
const userController = new UserController(
    new UserService(
        userRepository,
        new EngineService(),
        new AuthService(userRepository, bcryptRounds),
        new PesoRepository(prismaClient),
        new PlanRepository(prismaClient),
        perfilMapper,
    ),
);

// Mesmo limite do login: o 409 de e-mail duplicado é um oráculo de quem já tem
// conta, e sem limite dá para varrer uma lista de e-mails com ele.
router.post("/cadastro", limiteAutenticacao, userController.cadastrar);

router.use("/conta", autenticacao);
router.use("/perfil", autenticacao);
router.use("/peso", autenticacao);

// PATCH, e não PUT: a tela manda só o que mudou, e campo ausente é campo NÃO
// alterado — um PUT obrigaria a reenviar o perfil inteiro e transformaria um
// campo esquecido em apagamento.
// RF35 (LGPD): exige a senha no corpo além do token — a exclusão é
// irreversível, e o token sozinho tornaria um aparelho desbloqueado por alguns
// segundos suficiente para destruir o histórico de alguém.
router.delete("/conta", userController.excluirConta);

router.get("/perfil", userController.consultarPerfil);
router.patch("/perfil", userController.atualizarPerfil);

// Registrar o peso RECALCULA as metas na mesma chamada (RF33 + RF34): separá-las
// abriria a janela em que o peso já mudou e a meta calórica ainda é a de antes.
router.post("/peso", userController.registrarPeso);
router.get("/peso", userController.consultarPeso);

export default router;
