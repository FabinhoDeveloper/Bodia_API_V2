import { Router } from "express";

import prismaClient from "../config/prisma";
import TreinoController from "../controllers/treino.controller";
import autenticacao from "../middlewares/autenticacao";
import TreinoRepository from "../repositories/treino.repository";
import TreinoService from "../services/treino.service";

const router = Router();

const treinoController = new TreinoController(
    new TreinoService(new TreinoRepository(prismaClient)),
);

router.use("/treino", autenticacao);

// Abrir e concluir são duas chamadas, e não uma no fim, porque `iniciadoEm` é
// o que mede a duração do treino: gravar tudo ao concluir obrigaria a confiar
// num cronômetro enviado pelo cliente.
router.post("/treino", treinoController.abrir);
router.post("/treino/:registroTreinoId/concluir", treinoController.concluir);
// Sem `?de=&ate=`, a semana corrente (os cards da TreinoScreen); com eles, o
// histórico por período (RF27). Mesma pergunta, mesma resposta.
router.get("/treino", treinoController.consultar);

export default router;
