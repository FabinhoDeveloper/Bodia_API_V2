import CalculoService, { PerfilInput } from "../../src/services/CalculoService";
import CatalogoService from "../../src/services/CatalogoService";
import LlmService from "../../src/services/LlmService";
import PlanoService, { PerfilParaPlano } from "../../src/services/PlanoService";
import PromptService from "../../src/services/PromptService";

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
    return { gerarJson: jest.fn().mockResolvedValue(resposta) } as unknown as LlmService & {
        gerarJson: jest.Mock;
    };
}

describe("PlanoService", () => {
    const resultado = new CalculoService().calcular(PERFIL);

    function criarService(resposta: string) {
        const llmService = llmServiceFake(resposta);
        const planoService = new PlanoService(new CatalogoService(), new PromptService(), llmService);
        return { planoService, llmService };
    }

    it("devolve o plano quando os ids são válidos", async () => {
        const { planoService } = criarService(JSON.stringify(planoValido()));

        const { plano } = await planoService.gerar(PERFIL_PLANO, resultado);

        expect(plano.dieta.refeicoes[0].itens).toHaveLength(2);
        expect(plano.treino.sessoes[0].nome).toBe("Upper");
    });

    it("recalcula os macros a partir da TACO em vez de confiar no modelo", async () => {
        const { planoService } = criarService(JSON.stringify(planoValido()));

        const { validacao } = await planoService.gerar(PERFIL_PLANO, resultado);

        // 100g de arroz + 200g de frango:
        // kcal = 128.26 + 318.38 = 446.6 | proteína = 2.52 + 64.06 = 66.6
        expect(validacao.calorias.obtido).toBeCloseTo(446.6, 1);
        expect(validacao.proteina.obtido).toBeCloseTo(66.6, 1);
        expect(validacao.calorias.meta).toBe(resultado.meta.caloriasAlvo);
    });

    it("marca o plano como fora do limite quando o desvio é grande", async () => {
        const { planoService } = criarService(JSON.stringify(planoValido()));

        const { validacao } = await planoService.gerar(PERFIL_PLANO, resultado);

        // Uma única refeição não fecha a meta do dia inteiro.
        expect(validacao.dentroDoLimite).toBe(false);
        expect(validacao.calorias.desvioPercentual).toBeLessThan(-50);
    });

    it("rejeita alimento que não existe no catálogo (alucinação de id)", async () => {
        const plano = planoValido();
        plano.dieta.refeicoes[0].itens[0].alimentoId = 999999;
        const { planoService } = criarService(JSON.stringify(plano));

        await expect(planoService.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
            /alimento fora do catálogo permitido/,
        );
    });

    it("rejeita exercício que não existe no catálogo", async () => {
        const plano = planoValido();
        plano.treino.sessoes[0].exercicios[0].exercicioId = 999999;
        const { planoService } = criarService(JSON.stringify(plano));

        await expect(planoService.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
            /exercício fora do catálogo permitido/,
        );
    });

    // O catálogo filtrado é a fronteira de segurança: um alimento proibido não
    // pode entrar nem que o modelo cite o id correto dele.
    it("rejeita alimento proibido pela restrição, mesmo com id real", async () => {
        const { planoService } = criarService(JSON.stringify(planoValido()));

        await expect(
            planoService.gerar(
                { restricoesAlimentares: ["Vegano"], restricoesFisicas: [] },
                resultado,
            ),
        ).rejects.toThrow(/Frango, peito, sem pele, grelhado/);
    });

    it("rejeita JSON malformado", async () => {
        const { planoService } = criarService("isto não é json");

        await expect(planoService.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
            "A IA retornou um JSON inválido",
        );
    });

    it("rejeita plano sem dieta ou sem treino", async () => {
        const { planoService } = criarService(JSON.stringify({ dieta: { refeicoes: [] } }));

        await expect(planoService.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
            "A IA retornou um plano sem dieta ou sem treino",
        );
    });
});
