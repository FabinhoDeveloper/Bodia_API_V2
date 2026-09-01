import { Router } from "express";

import prismaClient from "../config/prisma";
import HidratacaoController from "../controllers/hidratacao.controller";
import autenticacao from "../middlewares/autenticacao";
import HidratacaoRepository from "../repositories/hidratacao.repository";
import PlanRepository from "../repositories/plan.repository";
import HidratacaoService from "../services/hidratacao.service";

const router = Router();

// O PlanRepository entra aqui só pela meta de água da ficha ativa — ele é o
// dono de FichaAlimentacao.
const hidratacaoController = new HidratacaoController(
    new HidratacaoService(
        new HidratacaoRepository(prismaClient),
        new PlanRepository(prismaClient),
    ),
);

router.use("/hidratacao", autenticacao);

router.post("/hidratacao", hidratacaoController.registrar);
router.get("/hidratacao", hidratacaoController.buscar);
// O usuarioId saiu da URL: era ele que impedia apagar registro alheio enquanto
// não havia token. O `where` do repository continua filtrando por usuário — só
// que agora com o id que veio da assinatura, e não com o que o cliente mandou.
router.delete("/hidratacao/:registroId", hidratacaoController.remover);

export default router;
