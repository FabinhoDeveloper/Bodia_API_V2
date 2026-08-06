import { Router } from "express";

import { deepseekModel, deepseekTimeoutMs, getDeepseekClient, simularIa } from "../config/deepseek";
import OnboardingController from "../controllers/OnboardingController";
import CalculoService from "../services/CalculoService";
import CatalogoService from "../services/CatalogoService";
import LlmService from "../services/LlmService";
import OnboardingService, { GeradorDePlano } from "../services/OnboardingService";
import PlanoMapper from "../services/PlanoMapper";
import PlanoService from "../services/PlanoService";
import PlanoSimuladoService from "../services/PlanoSimuladoService";
import PromptService from "../services/PromptService";

const router = Router();

// A flag decide quem monta o plano. O caminho da IA continua inteiro e volta
// com SIMULAR_IA=false — está desligado por causa da latência (~3 min) e das
// falhas por raciocínio descontrolado, não por estar quebrado.
const geradorDePlano: GeradorDePlano = simularIa
    ? new PlanoSimuladoService()
    : new PlanoService(
          new CatalogoService(),
          new PromptService(),
          new LlmService(getDeepseekClient, deepseekModel, deepseekTimeoutMs),
      );

console.log(`[onboarding] gerador de plano: ${simularIa ? "SIMULADO (fixture)" : "IA"}`);

const onboardingController = new OnboardingController(
    new OnboardingService(new CalculoService(), geradorDePlano, new PlanoMapper()),
);

router.post("/onboarding", onboardingController.receber);

export default router;
