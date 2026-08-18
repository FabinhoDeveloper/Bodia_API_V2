import EngineService from "../../src/services/engine.service";
import CatalogoFilter from "../../src/prompts/catalogo.filter";
import AiService from "../../src/services/ai.service";
import PlanoIaGenerator from "../../src/generators/plano-ia.generator";
import ValidadorMacros from "../../src/generators/validador-macros";
import PlanoPrompt from "../../src/prompts/plano.prompt";
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

// Arroz, tipo 1, cozido (id 3): 128.26 kcal, 2.52 prot, 28.06 carb, 0.23 gord /100g
// Frango, peito, sem pele, grelhado (id 410): 159.19 kcal, 32.03 prot, 0 carb, 2.48 gord /100g
function planoValido() {
    return {
        dieta: {
            refeicoes: [
                {
                    nome: "Almoço",
                    itens: [
                        { alimentoId: 3, nome: "Arroz, tipo 1, cozido", gramas: 100 },
                        { alimentoId: 410, nome: "Frango, peito, sem pele, grelhado", gramas: 200 },
                    ],
                },
            ],
        },
        treino: {
            sessoes: [
                {
                    nome: "Upper",
                    exercicios: [
                        { exercicioId: 1, nome: "Supino reto com barra", series: 4, repeticoes: "8-10" },
                    ],
                },
            ],
        },
        observacoes: "Beba água.",
    };
}

function llmServiceFake(resposta: string) {
    return { gerarJson: jest.fn().mockResolvedValue(resposta) } as unknown as AiService & {
        gerarJson: jest.Mock;
    };
}

describe("PlanoIaGenerator", () => {
    const resultado = new EngineService().calcular(PERFIL);

    function criarService(resposta: string) {
        const aiService = llmServiceFake(resposta);
        const planoIaGenerator = new PlanoIaGenerator(
            new CatalogoFilter(),
            new PlanoPrompt(),
            aiService,
            new ValidadorMacros(),
        );
        return { planoIaGenerator, aiService };
    }

    it("devolve o plano quando os ids são válidos", async () => {
        const { planoIaGenerator } = criarService(JSON.stringify(planoValido()));

        const { plano } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        expect(plano.dieta.refeicoes[0].itens).toHaveLength(2);
        expect(plano.treino.sessoes[0].nome).toBe("Upper");
    });

    it("recalcula os macros a partir da TACO em vez de confiar no modelo", async () => {
        const { planoIaGenerator } = criarService(JSON.stringify(planoValido()));

        const { validacao } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        // 100g de arroz + 200g de frango:
        // kcal = 128.26 + 318.38 = 446.6 | proteína = 2.52 + 64.06 = 66.6
        expect(validacao.calorias.obtido).toBeCloseTo(446.6, 1);
        expect(validacao.proteina.obtido).toBeCloseTo(66.6, 1);
        expect(validacao.calorias.meta).toBe(resultado.meta.caloriasAlvo);
    });

    it("marca o plano como fora do limite quando o desvio é grande", async () => {
        const { planoIaGenerator } = criarService(JSON.stringify(planoValido()));

        const { validacao } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        // Uma única refeição não fecha a meta do dia inteiro.
        expect(validacao.dentroDoLimite).toBe(false);
        expect(validacao.calorias.desvioPercentual).toBeLessThan(-50);
    });

    it("rejeita alimento que não existe no catálogo (alucinação de id)", async () => {
        const plano = planoValido();
        plano.dieta.refeicoes[0].itens[0].alimentoId = 999999;
        const { planoIaGenerator } = criarService(JSON.stringify(plano));

        await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
            /alimento fora do catálogo permitido/,
        );
    });

    it("rejeita exercício que não existe no catálogo", async () => {
        const plano = planoValido();
        plano.treino.sessoes[0].exercicios[0].exercicioId = 999999;
        const { planoIaGenerator } = criarService(JSON.stringify(plano));

        await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
            /exercício fora do catálogo permitido/,
        );
    });

    // O catálogo filtrado é a fronteira de segurança: um alimento proibido não
    // pode entrar nem que o modelo cite o id correto dele.
    it("rejeita alimento proibido pela restrição, mesmo com id real", async () => {
        const { planoIaGenerator } = criarService(JSON.stringify(planoValido()));

        await expect(
            planoIaGenerator.gerar(
                { restricoesAlimentares: ["Vegano"], restricoesFisicas: [] },
                resultado,
            ),
        ).rejects.toThrow(/Frango, peito, sem pele, grelhado/);
    });

    it("rejeita JSON malformado", async () => {
        const { planoIaGenerator } = criarService("isto não é json");

        await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
            "A IA retornou um JSON inválido",
        );
    });

    it("rejeita plano sem dieta ou sem treino", async () => {
        const { planoIaGenerator } = criarService(JSON.stringify({ dieta: { refeicoes: [] } }));

        await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
            "A IA retornou um plano sem dieta ou sem treino",
        );
    });
});
