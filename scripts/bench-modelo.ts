/**
 * TEMPORÁRIO — mede a geração real com o modelo de `IA_MODEL`, sem subir o
 * servidor. O `dotenv` não sobrescreve variável já definida no shell, então
 * `IA_MODEL=gpt-4o-mini npx tsx scripts/bench-modelo.ts` troca só esta rodada.
 *
 * Existe para responder ao RNF02 (geração em até 15 s) comparando modelos. Sai
 * junto com a pasta `benchmark/`.
 */
import "dotenv/config";

import BenchmarkService from "../src/benchmark/benchmark.service";
import { getIaClient, iaModel, iaParametros, iaTimeoutMs } from "../src/config/ia";
import DietaIaGenerator from "../src/generators/dieta-ia.generator";
import PlanoIaGenerator from "../src/generators/plano-ia.generator";
import TreinoIaGenerator from "../src/generators/treino-ia.generator";
import ValidadorMacros from "../src/generators/validador-macros";
import ValidadorVolume from "../src/generators/validador-volume";
import CatalogoFilter from "../src/prompts/catalogo.filter";
import DietaQuantidadesPrompt from "../src/prompts/dieta-quantidades.prompt";
import DietaSelecaoPrompt from "../src/prompts/dieta-selecao.prompt";
import TreinoPrompt from "../src/prompts/treino.prompt";
import AiService from "../src/services/ai.service";
import EngineService from "../src/services/engine.service";

const aiService = new AiService(getIaClient, iaModel, iaTimeoutMs, iaParametros);

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
)
    .executar()
    .then((r) => {
        console.log("\n=== RESULTADO ===");
        console.log("modelo:", r.modelo);
        console.log("total (wall clock):", (r.tempo.total_ms / 1000).toFixed(1), "s");
        console.log("etapas:", r.etapas.map((e) => `${e.nome} ${(e.ms / 1000).toFixed(1)}s`).join(" | "));
        console.log("validação ok:", r.resposta?.validacao_ok);
        if (r.resposta?.validacao) {
            for (const [nome, d] of Object.entries(r.resposta.validacao)) {
                if (typeof d === "object") {
                    console.log(`  ${nome}: ${d.obtido} de ${d.meta} (${d.desvioPercentual}%)`);
                }
            }
        }
        if (r.erro) console.log("erro:", r.erro);
    });
