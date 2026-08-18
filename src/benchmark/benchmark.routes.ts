import { Router } from "express";

import { deepseekModel, deepseekTimeoutMs, getDeepseekClient } from "../config/deepseek";
import BenchmarkController from "./benchmark.controller";
import BenchmarkService from "./benchmark.service";
import EngineService from "../services/engine.service";
import CatalogoFilter from "../prompts/catalogo.filter";
import AiService from "../services/ai.service";
import PlanoIaGenerator from "../generators/plano-ia.generator";
import PlanoPrompt from "../prompts/plano.prompt";

// Endpoint TEMPORÁRIO de benchmark — mede o caminho de geração real da IA
// (mesmo prompt, mesmo modelo, mesmo timeout de produção) com um perfil
// fictício fixo, sem precisar rodar o onboarding no app. Ver
// src/services/BenchmarkService.ts.
//
// Sempre chama a IA de verdade — ignora a flag SIMULAR_IA de propósito, já
// que o objetivo é medir a chamada real, não a fixture.
const router = Router();

const benchmarkController = new BenchmarkController(
    new BenchmarkService(
        new EngineService(),
        new PlanoIaGenerator(
            new CatalogoFilter(),
            new PlanoPrompt(),
            new AiService(getDeepseekClient, deepseekModel, deepseekTimeoutMs),
        ),
        deepseekModel,
    ),
);

router.get("/teste-geracao", benchmarkController.testarGeracao);

export default router;
