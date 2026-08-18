import { Router } from "express";

import { deepseekModel, deepseekTimeoutMs, getDeepseekClient, simularIa } from "../config/deepseek";
import OnboardingController from "../controllers/OnboardingController";
import EngineService from "../services/engine.service";
import CatalogoFilter from "../prompts/catalogo.filter";
import AiService from "../services/ai.service";
import OnboardingService from "../services/OnboardingService";
import PlanoMapper from "../mappers/plano.mapper";
import PlanoIaGenerator from "../generators/plano-ia.generator";
import PlanoSimuladoGenerator from "../generators/plano-simulado.generator";
import PlanoPrompt from "../prompts/plano.prompt";
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

const onboardingController = new OnboardingController(
    new OnboardingService(new EngineService(), geradorDePlano, new PlanoMapper()),
);

router.post("/onboarding", onboardingController.receber);

export default router;
