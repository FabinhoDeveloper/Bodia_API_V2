import { Router } from "express";

import prismaClient from "../config/prisma";
import RefeicaoController from "../controllers/refeicao.controller";
import autenticacao from "../middlewares/autenticacao";
import PlanRepository from "../repositories/plan.repository";
import RefeicaoRepository from "../repositories/refeicao.repository";
import RefeicaoService from "../services/refeicao.service";

const router = Router();

// O PlanRepository entra pela ficha ativa: metas, total de refeições e a
// conferência de que o refeicaoId é mesmo deste usuário.
const refeicaoController = new RefeicaoController(
    new RefeicaoService(new RefeicaoRepository(prismaClient), new PlanRepository(prismaClient)),
);

router.use("/refeicao", autenticacao);

router.post("/refeicao", refeicaoController.registrar);
router.get("/refeicao", refeicaoController.buscar);
// Desmarca pelo refeicaoId, e não pelo id do registro: como há no máximo um por
// dia, é o identificador que o app já tem em mãos vindo do plano.
router.delete("/refeicao/:refeicaoId", refeicaoController.remover);

export default router;
