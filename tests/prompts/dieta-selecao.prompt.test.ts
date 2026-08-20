import EngineService from "../../src/services/engine.service";
import CatalogoFilter from "../../src/prompts/catalogo.filter";
import DietaSelecaoPrompt from "../../src/prompts/dieta-selecao.prompt";
import { PerfilInput } from "../../src/types/perfil.types";

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

describe("DietaSelecaoPrompt", () => {
    const prompt = new DietaSelecaoPrompt();
    const catalogoFilter = new CatalogoFilter();
    const resultado = new EngineService().calcular(PERFIL);

    function montar(restricoesAlimentares: string[] = []) {
        return prompt.montar({
            resultado,
            alimentos: catalogoFilter.filtrarAlimentos(restricoesAlimentares),
            restricoesAlimentares,
        });
    }

    // A razão de esta chamada existir separada: se ela calcular, a divisão em
    // três não serviu para nada.
    it("proíbe explicitamente qualquer cálculo ou quantidade", () => {
        const { system } = montar();

        expect(system).toContain("NÃO informe quantidade, gramas, calorias");
        expect(system).toContain("Outra etapa calcula as porções");
    });

    it("proíbe citar alimento fora da lista", () => {
        const { system } = montar();

        expect(system).toContain("SOMENTE alimentos da lista fornecida, pelo id exato");
    });

    it("descreve o padrão brasileiro só das refeições deste usuário", () => {
        const { system } = montar();

        // numeroRefeicoes: 4
        expect(system).toContain("Café da manhã:");
        expect(system).toContain("Almoço:");
        expect(system).toContain("Lanche da tarde:");
        expect(system).toContain("Jantar:");
        // As que este usuário não faz não devem aparecer e gastar contexto.
        expect(system).not.toContain("Ceia:");
        expect(system).not.toContain("Lanche da manhã:");
    });

    it("veta no café da manhã o que motivou o padrão existir", () => {
        const { system } = montar();

        expect(system).toContain("NUNCA arroz, feijão, carne vermelha, peixe ou massa");
    });

    it("manda o catálogo com os valores por 100 g, para orientar a escolha", () => {
        const { user } = montar();

        expect(user).toContain("id|nome|kcal|proteína|carboidrato|gordura");
        expect(user).toContain("não são para calcular nada");
    });

    it("lista as refeições com o nome exato que o EngineService gerou", () => {
        const { user } = montar();

        for (const refeicao of resultado.dieta.refeicoes) {
            expect(user).toContain(refeicao.nome);
        }
    });

    // O catálogo já vem filtrado: a restrição é aplicada por código, não por
    // instrução — o modelo não pode escolher o que nunca viu.
    it("não envia alimento proibido pela restrição declarada", () => {
        const { user } = montar(["Vegano"]);

        expect(user).not.toMatch(/Frango, peito/i);
        expect(user).toContain("Vegano");
    });

    it("pede a resposta em json, no formato de ids por refeição", () => {
        const { system } = montar();

        expect(system).toContain("alimentoIds");
        expect(system).toMatch(/json/i);
    });
});
