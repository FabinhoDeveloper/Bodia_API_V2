import { Router } from "express";

import { getIaClient, iaModel, iaParametros, iaTimeoutMs } from "../config/ia";
import BenchmarkController from "./benchmark.controller";
import BenchmarkService from "./benchmark.service";
import EngineService from "../services/engine.service";
import CatalogoFilter from "../prompts/catalogo.filter";
import AiService from "../services/ai.service";
import DietaIaGenerator from "../generators/dieta-ia.generator";
import PlanoIaGenerator from "../generators/plano-ia.generator";
import AjusteSelecao from "../generators/ajuste-selecao";
import PorcoesSolver from "../generators/porcoes.solver";
import TreinoIaGenerator from "../generators/treino-ia.generator";
import ValidadorMacros from "../generators/validador-macros";
import ValidadorVolume from "../generators/validador-volume";
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

// Um ValidadorMacros só, compartilhado com o AjusteSelecao: o retorno que vai ao
// modelo precisa sair da MESMA conta que reprova o plano.
const validadorMacros = new ValidadorMacros();

const benchmarkController = new BenchmarkController(
    new BenchmarkService(
        new EngineService(),
        new PlanoIaGenerator(
            new CatalogoFilter(),
            new DietaIaGenerator(new DietaSelecaoPrompt(), aiService, new PorcoesSolver()),
            new TreinoIaGenerator(new TreinoPrompt(), aiService),
            validadorMacros,
            new ValidadorVolume(),
            new AjusteSelecao(validadorMacros),
        ),
        iaModel,
    ),
);

router.get("/teste-geracao", benchmarkController.testarGeracao);

export default router;
