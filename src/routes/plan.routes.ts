import { Router } from "express";

import { getIaClient, iaModel, iaParametros, iaTimeoutMs, simularIa } from "../config/ia";
import prismaClient from "../config/prisma";
import PlanController from "../controllers/plan.controller";
import DietaIaGenerator from "../generators/dieta-ia.generator";
import AjusteSelecao from "../generators/ajuste-selecao";
import PlanoIaGenerator from "../generators/plano-ia.generator";
import PorcoesSolver from "../generators/porcoes.solver";
import PlanoSimuladoGenerator from "../generators/plano-simulado.generator";
import TreinoIaGenerator from "../generators/treino-ia.generator";
import ValidadorMacros from "../generators/validador-macros";
import ValidadorVolume from "../generators/validador-volume";
import ConferenciaMapper from "../mappers/conferencia.mapper";
import FichaMapper from "../mappers/ficha.mapper";
import MeuPlanoMapper from "../mappers/meu-plano.mapper";
import PerfilMapper from "../mappers/perfil.mapper";
import PlanoMapper from "../mappers/plano.mapper";
import CatalogoFilter from "../prompts/catalogo.filter";
import DietaSelecaoPrompt from "../prompts/dieta-selecao.prompt";
import TreinoPrompt from "../prompts/treino.prompt";
import autenticacao from "../middlewares/autenticacao";
import PesoRepository from "../repositories/peso.repository";
import PlanRepository from "../repositories/plan.repository";
import RefeicaoRepository from "../repositories/refeicao.repository";
import AiService from "../services/ai.service";
import EngineService from "../services/engine.service";
import PlanService from "../services/plan.service";
import { GeradorDePlano } from "../types/plano.types";

const router = Router();

// A flag decide quem monta o plano; com SIMULAR_IA=false entra o caminho real,
// que hoje são DUAS chamadas à IA (seleção de alimentos e treino) em vez da
// chamada única que tentava fazer tudo de uma vez. As gramas não são pedidas ao
// modelo: quem as resolve é o PorcoesSolver.
function montarGeradorIa(): PlanoIaGenerator {
    // Um AiService só, compartilhado pelas duas chamadas: mesmo cliente, mesmo
    // modelo, mesmos parâmetros. Duas instâncias poderiam divergir sem aviso.
    const aiService = new AiService(getIaClient, iaModel, iaTimeoutMs, iaParametros);

    // Um ValidadorMacros só, compartilhado com o AjusteSelecao: o retorno que
    // vai ao modelo precisa sair da MESMA conta que reprova o plano, senão o
    // gerador corrigiria um desvio diferente do que o validador mede.
    const validadorMacros = new ValidadorMacros();

    return new PlanoIaGenerator(
        new CatalogoFilter(),
        new DietaIaGenerator(new DietaSelecaoPrompt(), aiService, new PorcoesSolver()),
        new TreinoIaGenerator(new TreinoPrompt(), aiService),
        validadorMacros,
        new ValidadorVolume(),
        new AjusteSelecao(validadorMacros),
    );
}

const geradorDePlano: GeradorDePlano = simularIa
    ? new PlanoSimuladoGenerator(new ValidadorMacros(), new ValidadorVolume())
    : montarGeradorIa();

console.log(`[onboarding] gerador de plano: ${simularIa ? "SIMULADO (fixture)" : "IA"}`);

// O PesoRepository entra aqui pelo PERFIL: regenerar lê os dados do banco, e
// não do payload — o usuário não troca o próprio sexo numa requisição cujo
// propósito é pedir outro cardápio.
//
// O RefeicaoRepository entra por UMA pergunta: o usuário já marcou alguma
// refeição hoje? É ela que decide se o plano novo vale agora ou só amanhã.
const planController = new PlanController(
    new PlanService(
        new EngineService(),
        geradorDePlano,
        new PlanoMapper(),
        new PlanRepository(prismaClient, new FichaMapper()),
        new MeuPlanoMapper(),
        new PesoRepository(prismaClient),
        new PerfilMapper(),
        new ConferenciaMapper(),
        new RefeicaoRepository(prismaClient),
    ),
);

// Público: gerar o plano acontece ANTES de a conta existir — é o que o usuário
// vê para decidir se quer se cadastrar.
router.post("/onboarding", planController.gerar);
// O usuarioId saiu da URL: quem pede o plano é quem o token diz que é.
router.get("/plano", autenticacao, planController.buscar);
// RF20: gera outro plano para quem já tem conta e o grava na hora. O perfil vem
// do banco. GRAVA na hora, mas só ENTRA EM VIGOR amanhã se o dia já tiver
// refeição marcada — a resposta traz o plano em vigor, com `planoAgendado`
// dizendo a partir de quando o novo vale, e a `conferencia` dos validadores
// (RF22), que antes só o onboarding recebia.
router.post("/plano/regenerar", autenticacao, planController.regenerar);

export default router;
