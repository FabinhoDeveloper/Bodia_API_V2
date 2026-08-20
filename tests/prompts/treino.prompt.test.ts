import EngineService from "../../src/services/engine.service";
import CatalogoFilter from "../../src/prompts/catalogo.filter";
import TreinoPrompt from "../../src/prompts/treino.prompt";
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

describe("TreinoPrompt", () => {
    const prompt = new TreinoPrompt();
    const catalogoFilter = new CatalogoFilter();
    const resultado = new EngineService().calcular(PERFIL);

    function montar(restricoesFisicas: string[] = []) {
        return prompt.montar({
            resultado,
            exercicios: catalogoFilter.filtrarExercicios(
                restricoesFisicas,
                resultado.treino.sessoes.map((s) => s.nome),
            ),
            restricoesFisicas,
        });
    }

    it("proíbe recalcular o que veio do motor e citar exercício de fora", () => {
        const { system } = montar();

        expect(system).toContain("NUNCA recalcule");
        expect(system).toContain("NUNCA use um exercício que não esteja na lista");
    });

    // Estes limites existem porque, em teste real, o modelo leu "18 séries por
    // grupo na semana" como "18 séries deste exercício" e montou sessões de 15
    // exercícios. Não remover.
    it("mantém os limites de volume por sessão e por exercício", () => {
        const { system } = montar();

        expect(system).toContain("Entre 4 e 7 exercícios por sessão");
        expect(system).toContain("NUNCA mais que 5 séries no mesmo exercício");
        expect(system).toContain("TOTAL a ser DISTRIBUÍDO");
    });

    it("dá um exemplo de como distribuir o volume semanal", () => {
        const { system } = montar();

        expect(system).toContain("Nunca um único exercício de 12 séries");
    });

    it("cita a literatura de volume, e não a de macros", () => {
        const { system } = montar();

        expect(system).toContain("PELLAND et al., 2024");
        expect(system).toContain("SCHOENFELD; OGBORN; KRIEGER, 2016");
        // Macro não tem nada a ver com esta chamada.
        expect(system).not.toContain("KERKSICK");
        expect(system).not.toContain("STOKES");
    });

    // O ganho de separar do prompt da dieta: a TACO inteira sumiu do contexto.
    it("não carrega o catálogo de alimentos", () => {
        const { user } = montar();

        expect(user).not.toMatch(/Arroz, tipo 1, cozido/i);
        expect(user).not.toContain("META DE PROTEÍNA");
        expect(user).toContain("Exercícios disponíveis");
    });

    it("informa as sessões com a frequência semanal de cada uma", () => {
        const { user } = montar();

        for (const sessao of resultado.treino.sessoes) {
            expect(user).toContain(`${sessao.nome} (${sessao.frequenciaSemanal}x por semana)`);
        }
        expect(user).toContain(String(resultado.treino.seriesPorGrupoSemana));
    });

    it("não envia exercício contraindicado pela restrição declarada", () => {
        const semRestricao = montar().user;
        const comJoelho = montar(["Joelho"]).user;

        expect(comJoelho.length).toBeLessThan(semRestricao.length);
        expect(comJoelho).toContain("Joelho");
    });

    it("pede a resposta em json com exercicioId, séries e repetições", () => {
        const { system } = montar();

        expect(system).toContain("exercicioId");
        expect(system).toContain("repeticoes");
        expect(system).toMatch(/json/i);
    });
});
