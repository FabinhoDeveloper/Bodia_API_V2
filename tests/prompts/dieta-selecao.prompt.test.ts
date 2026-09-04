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

/**
 * O retorno da tentativa anterior. Repetir o mesmo prompt daria a mesma
 * resposta — o que muda a segunda tentativa é o desvio medido voltando para
 * dentro dela.
 */
describe("DietaSelecaoPrompt — retorno da tentativa anterior", () => {
    const prompt = new DietaSelecaoPrompt();
    const resultado = new EngineService().calcular(PERFIL);

    const contextoBase = () => ({
        resultado,
        alimentos: new CatalogoFilter().filtrarAlimentos([]),
        restricoesAlimentares: [],
    });

    it("não fala em tentativa anterior na primeira geração", () => {
        const { user } = prompt.montar(contextoBase());

        expect(user).not.toContain("Tentativa anterior");
    });

    it("cita a refeição e a instrução quando há ajuste", () => {
        const { user } = prompt.montar({
            ...contextoBase(),
            ajuste: ["- Almoço: Inclua um carboidrato mais denso."],
        });

        expect(user).toContain("# Tentativa anterior");
        expect(user).toContain("Almoço");
        expect(user).toContain("Inclua um carboidrato mais denso.");
    });

    // O catálogo é longo o bastante para enterrar qualquer instrução colocada
    // antes dele; a mais recente precisa ser a última coisa que o modelo lê.
    it("põe o ajuste depois do catálogo, junto do pedido", () => {
        const { user } = prompt.montar({
            ...contextoBase(),
            ajuste: ["- Jantar: Inclua uma fonte de gordura."],
        });

        expect(user.indexOf("Tentativa anterior")).toBeGreaterThan(
            user.indexOf("# Alimentos disponíveis"),
        );
    });

    it("ignora ajuste vazio", () => {
        const { user } = prompt.montar({ ...contextoBase(), ajuste: [] });

        expect(user).not.toContain("Tentativa anterior");
    });
});
