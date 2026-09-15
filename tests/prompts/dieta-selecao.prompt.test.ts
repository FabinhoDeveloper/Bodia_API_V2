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
 * O ajuste de UMA refeição cujos macros não fecharam. A chamada não tem memória:
 * sem a seleção anterior no prompt, "troque um dos carboidratos" não se refere a
 * nada e o modelo sortearia um prato novo.
 */
describe("DietaSelecaoPrompt — reajuste de uma refeição", () => {
    const prompt = new DietaSelecaoPrompt();
    const resultado = new EngineService().calcular(PERFIL);
    const alimentos = new CatalogoFilter().filtrarAlimentos([]);
    const porId = new Map(alimentos.map((a) => [a.id, a]));

    const contexto = () => ({
        resultado,
        alimentos,
        restricoesAlimentares: [],
        refeicao: "Almoço",
        anteriores: [porId.get(3)!, porId.get(410)!],
        instrucao: "Inclua uma fonte de gordura — azeite, castanhas, queijo ou manteiga.",
    });

    it("mostra ao modelo o que a refeição tem hoje, com id e nome", () => {
        const { user } = prompt.montarReajuste(contexto());

        expect(user).toContain("# Como \"Almoço\" está hoje");
        expect(user).toContain(`3|${porId.get(3)!.nome}`);
        expect(user).toContain(`410|${porId.get(410)!.nome}`);
    });

    it("leva a instrução em linguagem de comida", () => {
        const { user } = prompt.montarReajuste(contexto());

        expect(user).toContain("Inclua uma fonte de gordura");
    });

    // O catálogo é longo o bastante para enterrar qualquer instrução colocada
    // antes dele; o prato atual e o pedido precisam ser o que o modelo lê por último.
    it("põe o prato atual e a instrução depois do catálogo", () => {
        const { user } = prompt.montarReajuste(contexto());

        expect(user.indexOf("está hoje")).toBeGreaterThan(user.indexOf("# Alimentos disponíveis"));
        expect(user.indexOf("# O que mudar")).toBeGreaterThan(user.indexOf("está hoje"));
    });

    it("pede para mudar o mínimo, e não montar outro prato", () => {
        const { system } = prompt.montarReajuste(contexto());

        expect(system).toMatch(/Mude o MÍNIMO/);
        expect(system).toContain('Devolva SÓ a refeição "Almoço"');
    });

    it("continua proibindo cálculo e id fora da lista", () => {
        const { system } = prompt.montarReajuste(contexto());

        expect(system).toMatch(/NÃO informe quantidade/);
        expect(system).toMatch(/SOMENTE alimentos da lista/);
    });

    it("a seleção completa não fala mais em tentativa anterior", () => {
        const { user } = prompt.montar({ resultado, alimentos, restricoesAlimentares: [] });

        expect(user).not.toContain("Tentativa anterior");
    });
});
