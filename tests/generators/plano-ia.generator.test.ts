import EngineService from "../../src/services/engine.service";
import CatalogoFilter from "../../src/prompts/catalogo.filter";
import AiService from "../../src/services/ai.service";
import DietaIaGenerator from "../../src/generators/dieta-ia.generator";
import PlanoIaGenerator from "../../src/generators/plano-ia.generator";
import TreinoIaGenerator from "../../src/generators/treino-ia.generator";
import ValidadorMacros from "../../src/generators/validador-macros";
import DietaQuantidadesPrompt from "../../src/prompts/dieta-quantidades.prompt";
import DietaSelecaoPrompt from "../../src/prompts/dieta-selecao.prompt";
import TreinoPrompt from "../../src/prompts/treino.prompt";
import { PerfilInput, PerfilParaPlano } from "../../src/types/perfil.types";

const PERFIL: PerfilInput = {
    sexo: "F",
    dataNascimento: "1998-04-10",
    peso: 65,
    altura: 165,
    percentualGordura: 20,
    nivelAtividade: "moderado",
    nivelExperiencia: "iniciante",
    objetivo: "perder",
    diasPorSemana: 4,
    numeroRefeicoes: 4,
};

const PERFIL_PLANO: PerfilParaPlano = { restricoesAlimentares: [], restricoesFisicas: [] };

// numeroRefeicoes: 4 -> estes são os nomes que o EngineService gera.
const REFEICOES = ["Café da manhã", "Almoço", "Lanche da tarde", "Jantar"];

// Arroz, tipo 1, cozido (id 3): 128.26 kcal, 2.52 prot, 28.06 carb, 0.23 gord /100g
// Frango, peito, sem pele, grelhado (id 410): 159.19 kcal, 32.03 prot, 0 carb, 2.48 gord /100g
const ARROZ = 3;
const FRANGO = 410;

function selecaoValida() {
    return {
        refeicoes: REFEICOES.map((nome) => ({ nome, alimentoIds: [ARROZ, FRANGO] })),
    };
}

function quantidadesValidas() {
    return {
        refeicoes: REFEICOES.map((nome) => ({
            nome,
            itens: [
                { alimentoId: ARROZ, nome: "Arroz, tipo 1, cozido", gramas: 25 },
                { alimentoId: FRANGO, nome: "Frango, peito, sem pele, grelhado", gramas: 50 },
            ],
        })),
    };
}

function treinoValido() {
    return {
        sessoes: [
            {
                nome: "Upper",
                exercicios: [
                    { exercicioId: 1, nome: "Supino reto com barra", series: 4, repeticoes: "8-10" },
                ],
            },
        ],
        observacoes: "Beba água.",
    };
}

/**
 * Fake que responde por ETAPA, e não por ordem de chamada: dieta e treino rodam
 * em Promise.all, então a ordem em que chegam não é determinística.
 */
function aiServiceFake(respostas: Partial<Record<string, unknown | string>>) {
    const gerarJson = jest.fn(async (_system: string, _user: string, etapa: string) => {
        const resposta = respostas[etapa];

        if (resposta === undefined) throw new Error(`etapa inesperada no teste: ${etapa}`);
        return typeof resposta === "string" ? resposta : JSON.stringify(resposta);
    });

    return { gerarJson } as unknown as AiService & { gerarJson: jest.Mock };
}

function criarGerador(respostas: Partial<Record<string, unknown | string>>) {
    const aiService = aiServiceFake(respostas);

    const planoIaGenerator = new PlanoIaGenerator(
        new CatalogoFilter(),
        new DietaIaGenerator(new DietaSelecaoPrompt(), new DietaQuantidadesPrompt(), aiService),
        new TreinoIaGenerator(new TreinoPrompt(), aiService),
        new ValidadorMacros(),
    );

    return { planoIaGenerator, aiService };
}

const RESPOSTAS_OK = {
    "dieta:seleção": selecaoValida(),
    "dieta:quantidades": quantidadesValidas(),
    treino: treinoValido(),
};

describe("PlanoIaGenerator", () => {
    const resultado = new EngineService().calcular(PERFIL);

    it("monta o plano a partir das três chamadas", async () => {
        const { planoIaGenerator, aiService } = criarGerador(RESPOSTAS_OK);

        const { plano } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        expect(aiService.gerarJson).toHaveBeenCalledTimes(3);
        expect(plano.dieta.refeicoes).toHaveLength(4);
        expect(plano.treino.sessoes[0].nome).toBe("Upper");
        expect(plano.observacoes).toBe("Beba água.");
    });

    it("recalcula os macros a partir da TACO em vez de confiar no modelo", async () => {
        const { planoIaGenerator } = criarGerador(RESPOSTAS_OK);

        const { validacao } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        // 4 refeições x (25g de arroz + 50g de frango):
        // kcal = 4 x (32.065 + 79.595) = 446.6
        expect(validacao.calorias.obtido).toBeCloseTo(446.6, 1);
        expect(validacao.calorias.meta).toBe(resultado.meta.caloriasAlvo);
        expect(validacao.dentroDoLimite).toBe(false);
    });

    it("usa o nome do catálogo, não o que a IA escreveu", async () => {
        const quantidades = quantidadesValidas();
        quantidades.refeicoes[0].itens[0].nome = "Arrroz inventado pela IA";

        const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:quantidades": quantidades });

        const { plano } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        expect(plano.dieta.refeicoes[0].itens[0].nome).toBe("Arroz, tipo 1, cozido");
    });

    describe("chamada 1 — seleção", () => {
        it("rejeita alimento que não existe no catálogo (alucinação de id)", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[0].alimentoIds = [999999];

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /alimento fora do catálogo permitido/,
            );
        });

        // O catálogo filtrado é a fronteira de segurança: um alimento proibido
        // não pode entrar nem que o modelo cite o id correto dele.
        it("rejeita alimento proibido pela restrição, mesmo com id real", async () => {
            const { planoIaGenerator } = criarGerador(RESPOSTAS_OK);

            await expect(
                planoIaGenerator.gerar(
                    { restricoesAlimentares: ["Vegano"], restricoesFisicas: [] },
                    resultado,
                ),
            ).rejects.toThrow(/alimento fora do catálogo permitido/);
        });

        it("rejeita seleção com refeição faltando", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes = selecao.refeicoes.slice(1);

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /não escolheu alimentos para a refeição "Café da manhã"/,
            );
        });

        it("rejeita refeição sem alimento nenhum", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [];

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /não escolheu alimentos para a refeição "Almoço"/,
            );
        });

        it("não chama a etapa de quantidades quando a seleção falha", async () => {
            const { planoIaGenerator, aiService } = criarGerador({
                ...RESPOSTAS_OK,
                "dieta:seleção": "isto não é json",
            });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                "A IA retornou um JSON inválido na seleção de alimentos",
            );

            const etapas = aiService.gerarJson.mock.calls.map((c) => c[2]);
            expect(etapas).not.toContain("dieta:quantidades");
        });
    });

    describe("chamada 2 — quantidades", () => {
        // O ganho da divisão: nesta etapa o universo válido não é o catálogo
        // inteiro, é o punhado que a PRÓPRIA IA escolheu na chamada 1.
        it("rejeita alimento que existe na TACO mas não estava na seleção", async () => {
            const quantidades = quantidadesValidas();
            // 82 = Batata, doce, cozida — real no catálogo, ausente da seleção.
            quantidades.refeicoes[0].itens[0].alimentoId = 82;

            const { planoIaGenerator } = criarGerador({
                ...RESPOSTAS_OK,
                "dieta:quantidades": quantidades,
            });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /não estava na seleção da refeição "Café da manhã"/,
            );
        });

        it.each([0, -50])("rejeita gramas inválidas (%p)", async (gramas) => {
            const quantidades = quantidadesValidas();
            quantidades.refeicoes[0].itens[0].gramas = gramas;

            const { planoIaGenerator } = criarGerador({
                ...RESPOSTAS_OK,
                "dieta:quantidades": quantidades,
            });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /quantidade inválida/,
            );
        });

        it("rejeita refeição sem quantidades", async () => {
            const quantidades = quantidadesValidas();
            quantidades.refeicoes[2].itens = [];

            const { planoIaGenerator } = criarGerador({
                ...RESPOSTAS_OK,
                "dieta:quantidades": quantidades,
            });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /não definiu as quantidades da refeição "Lanche da tarde"/,
            );
        });
    });

    describe("chamada 3 — treino", () => {
        it("rejeita exercício que não existe no catálogo", async () => {
            const treino = treinoValido();
            treino.sessoes[0].exercicios[0].exercicioId = 999999;

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, treino });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /exercício fora do catálogo permitido/,
            );
        });

        it("rejeita treino sem sessões", async () => {
            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, treino: { sessoes: [] } });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                "A IA retornou um treino sem sessões",
            );
        });

        it("rejeita JSON malformado", async () => {
            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, treino: "nada de json" });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                "A IA retornou um JSON inválido no treino",
            );
        });
    });
});
