import { Router } from "express";

import { deepseekModel, deepseekTimeoutMs, getDeepseekClient } from "../config/deepseek";
import BenchmarkController from "../controllers/BenchmarkController";
import BenchmarkGeracaoService from "../services/BenchmarkGeracaoService";
import CalculoService from "../services/CalculoService";
import CatalogoService from "../services/CatalogoService";
import LlmService from "../services/LlmService";
import PlanoService from "../services/PlanoService";
import PromptService from "../services/PromptService";

// Endpoint TEMPORÁRIO de benchmark — mede o caminho de geração real da IA
// (mesmo prompt, mesmo modelo, mesmo timeout de produção) com um perfil
// fictício fixo, sem precisar rodar o onboarding no app. Ver
// src/services/BenchmarkGeracaoService.ts.
//
// Sempre chama a IA de verdade — ignora a flag SIMULAR_IA de propósito, já
// que o objetivo é medir a chamada real, não a fixture.
const router = Router();

const benchmarkController = new BenchmarkController(
    new BenchmarkGeracaoService(
        new CalculoService(),
        new PlanoService(
            new CatalogoService(),
            new PromptService(),
            new LlmService(getDeepseekClient, deepseekModel, deepseekTimeoutMs),
        ),
        deepseekModel,
    ),
);

router.get("/teste-geracao", benchmarkController.testarGeracao);

export default router;
