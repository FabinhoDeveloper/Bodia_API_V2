import CalculoService, { PerfilInput } from "../../src/services/CalculoService";
import CatalogoService from "../../src/services/CatalogoService";
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

describe("PromptService", () => {
    const promptService = new PromptService();
    const catalogoService = new CatalogoService();
    const resultado = new CalculoService().calcular(PERFIL);

    function montar(restricoesAlimentares: string[] = [], restricoesFisicas: string[] = []) {
        return promptService.montar({
            resultado,
            alimentos: catalogoService.filtrarAlimentos(restricoesAlimentares),
            exercicios: catalogoService.filtrarExercicios(
                restricoesFisicas,
                resultado.treino.sessoes.map((s) => s.nome),
            ),
            restricoesAlimentares,
            restricoesFisicas,
        });
    }

    it("proíbe o modelo de recalcular ou inventar valores", () => {
        const { system } = montar();

        expect(system).toContain("NUNCA recalcule");
        expect(system).toContain("NUNCA use um alimento ou exercício que não esteja nas listas");
        expect(system).toContain("NUNCA invente valores nutricionais");
    });

    it("cita a literatura que embasa cada limite, para o modelo não tentar melhorá-los", () => {
        const { system } = montar();

        expect(system).toContain("PELLAND et al., 2024");
        expect(system).toContain("SCHOENFELD; OGBORN; KRIEGER, 2016");
        expect(system).toContain("JÄGER et al., 2017");
        expect(system).toContain("STOKES et al., 2018");
        expect(system).toContain("KERKSICK et al., 2017");
        expect(system).toContain("MIFFLIN et al., 1990");
    });

    // O JSON mode da DeepSeek exige a palavra "json" no prompt e um exemplo do
    // formato esperado.
    it("atende aos requisitos do JSON mode", () => {
        const { system, user } = montar();

        expect(`${system}${user}`.toLowerCase()).toContain("json");
        expect(system).toContain('"alimentoId"');
        expect(system).toContain('"exercicioId"');
    });

    // Sem estes limites o modelo lê "18 séries por grupo na semana" como "18 séries
    // deste exercício", e monta sessões de 15 exercícios — observado em teste real.
    it("limita séries por exercício e exercícios por sessão", () => {
        const { system } = montar();

        expect(system).toContain("NUNCA mais que 5 séries no mesmo exercício");
        expect(system).toContain("Nunca mais que 7");
        expect(system).toContain("TOTAL a ser DISTRIBUÍDO");
    });

    it("injeta os valores calculados que o modelo precisa respeitar", () => {
        const { user } = montar();

        expect(user).toContain(`META CALÓRICA DIÁRIA: ${resultado.meta.caloriasAlvo} kcal`);
        expect(user).toContain(`META DE PROTEÍNA: ${resultado.macros.proteina.g} g`);
        expect(user).toContain(resultado.treino.split);
        expect(user).toContain(`distribuir entre exercícios e sessões): ${resultado.treino.seriesPorGrupoSemana}`);
        expect(user).toContain(`Número de refeições no dia: ${resultado.dieta.numeroRefeicoes}`);
    });

    it("lista os alimentos com id e macros por 100 g", () => {
        const { user } = montar();

        // Arroz, tipo 1, cozido — id 3, 128.26 kcal por 100 g na TACO.
        expect(user).toContain("3|Arroz, tipo 1, cozido|128.26|");
    });

    it("não injeta alimento proibido pela restrição do usuário", () => {
        const { user } = montar(["Vegano"]);

        expect(user).not.toContain("Frango, peito, sem pele, cru");
        expect(user).not.toContain("Queijo, mozarela");
    });

    it("não injeta exercício contraindicado pela lesão do usuário", () => {
        const { user } = montar([], ["Joelho"]);

        expect(user).not.toContain("Agachamento livre com barra");
        expect(user).not.toContain("Cadeira extensora");
    });
});
