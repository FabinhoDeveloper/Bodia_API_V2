import { Router } from "express";

import { deepseekModel, deepseekTimeoutMs, getDeepseekClient, simularIa } from "../config/deepseek";
import prismaClient from "../config/prisma";
import PlanController from "../controllers/plan.controller";
import PlanoIaGenerator from "../generators/plano-ia.generator";
import PlanoSimuladoGenerator from "../generators/plano-simulado.generator";
import MeuPlanoMapper from "../mappers/meu-plano.mapper";
import PlanoMapper from "../mappers/plano.mapper";
import CatalogoFilter from "../prompts/catalogo.filter";
import PlanoPrompt from "../prompts/plano.prompt";
import PlanRepository from "../repositories/plan.repository";
import AiService from "../services/ai.service";
import EngineService from "../services/engine.service";
import PlanService from "../services/plan.service";
import { GeradorDePlano } from "../types/plano.types";

const router = Router();

// A flag decide quem monta o plano. O caminho da IA continua inteiro e volta
// com SIMULAR_IA=false — está desligado por causa da latência (~3 min) e das
// falhas por raciocínio descontrolado, não por estar quebrado.
const geradorDePlano: GeradorDePlano = simularIa
    ? new PlanoSimuladoGenerator()
    : new PlanoIaGenerator(
          new CatalogoFilter(),
          new PlanoPrompt(),
          new AiService(getDeepseekClient, deepseekModel, deepseekTimeoutMs),
      );

console.log(`[onboarding] gerador de plano: ${simularIa ? "SIMULADO (fixture)" : "IA"}`);

const planController = new PlanController(
    new PlanService(
        new EngineService(),
        geradorDePlano,
        new PlanoMapper(),
        new PlanRepository(prismaClient),
        new MeuPlanoMapper(),
    ),
);

router.post("/onboarding", planController.gerar);
router.get("/plano/:usuarioId", planController.buscar);

export default router;
