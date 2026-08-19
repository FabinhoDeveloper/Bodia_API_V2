import { Router } from "express";

import prismaClient from "../config/prisma";
import HidratacaoController from "../controllers/hidratacao.controller";
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

router.post("/hidratacao", hidratacaoController.registrar);
router.get("/hidratacao/:usuarioId", hidratacaoController.buscar);
// O usuarioId na URL do DELETE não é decoração: é ele que impede apagar
// registro de outra pessoa, já que não há token para dizer quem está pedindo.
router.delete("/hidratacao/:usuarioId/:registroId", hidratacaoController.remover);

export default router;
