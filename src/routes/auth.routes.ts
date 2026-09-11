import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import { emailRemetente, getTransportadorEmail, simularEmail, urlPublica } from "../config/email";
import prismaClient from "../config/prisma";
import { limiteAutenticacao, limiteRecuperacaoSenha } from "../config/seguranca";
import AuthController from "../controllers/auth.controller";
import ConsoleEnviador from "../emails/console.enviador";
import SmtpEnviador from "../emails/smtp.enviador";
import FichaMapper from "../mappers/ficha.mapper";
import PerfilMapper from "../mappers/perfil.mapper";
import autenticacao from "../middlewares/autenticacao";
import RedefinicaoSenhaRepository from "../repositories/redefinicao-senha.repository";
import UserRepository from "../repositories/user.repository";
import AuthService from "../services/auth.service";

const router = Router();

const authController = new AuthController(
    new AuthService(
        new UserRepository(prismaClient, new PerfilMapper(), new FichaMapper()),
        new RedefinicaoSenhaRepository(prismaClient),
        simularEmail ? new ConsoleEnviador() : new SmtpEnviador(getTransportadorEmail, emailRemetente),
        bcryptRounds,
        urlPublica,
    ),
);

// O limite estreito é o que sobra contra força bruta depois do bcrypt: sem ele,
// tentar milhares de senhas custaria só tempo de CPU do servidor.
router.post("/login", limiteAutenticacao, authController.entrar);

// RF03. Limite próprio, que conta TODO pedido: esta rota responde 202 sempre, e
// o `limiteAutenticacao` só conta os que falham — nunca dispararia aqui.
router.post("/senha/esqueci", limiteRecuperacaoSenha, authController.solicitarRedefinicao);

// Chamada pela página que o link do e-mail abre, não pelo app.
router.post("/senha/redefinir", limiteAutenticacao, authController.redefinir);

// Troca dentro da conta. O limite também vale aqui: com um token roubado, a
// senha atual exigida no corpo é a última barreira, e sem limite ela cairia por
// força bruta.
router.patch("/senha", autenticacao, limiteAutenticacao, authController.alterar);

export default router;
