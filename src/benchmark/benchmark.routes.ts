import { Router } from "express";

import { getIaClient, iaModel, iaParametros, iaTimeoutMs } from "../config/ia";
import BenchmarkController from "./benchmark.controller";
import BenchmarkService from "./benchmark.service";
import EngineService from "../services/engine.service";
import CatalogoFilter from "../prompts/catalogo.filter";
import AiService from "../services/ai.service";
import DietaIaGenerator from "../generators/dieta-ia.generator";
import PlanoIaGenerator from "../generators/plano-ia.generator";
import TreinoIaGenerator from "../generators/treino-ia.generator";
import ValidadorMacros from "../generators/validador-macros";
import ValidadorVolume from "../generators/validador-volume";
import DietaQuantidadesPrompt from "../prompts/dieta-quantidades.prompt";
import DietaSelecaoPrompt from "../prompts/dieta-selecao.prompt";
import TreinoPrompt from "../prompts/treino.prompt";

// Endpoint TEMPORÁRIO de benchmark — mede o caminho de geração real da IA
// (mesmos prompts, mesmo modelo, mesmo timeout de produção) com um perfil
// fictício fixo, sem precisar rodar o onboarding no app.
//
// Sempre chama a IA de verdade — ignora a flag SIMULAR_IA de propósito, já
// que o objetivo é medir a chamada real, não a fixture.
const router = Router();

const aiService = new AiService(getIaClient, iaModel, iaTimeoutMs, iaParametros);

const benchmarkController = new BenchmarkController(
    new BenchmarkService(
        new EngineService(),
        new PlanoIaGenerator(
            new CatalogoFilter(),
            new DietaIaGenerator(new DietaSelecaoPrompt(), new DietaQuantidadesPrompt(), aiService),
            new TreinoIaGenerator(new TreinoPrompt(), aiService),
            new ValidadorMacros(),
            new ValidadorVolume(),
        ),
        iaModel,
    ),
);

router.get("/teste-geracao", benchmarkController.testarGeracao);

export default router;
