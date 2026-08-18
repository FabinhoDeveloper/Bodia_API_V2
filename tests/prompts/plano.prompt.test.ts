import EngineService from "../../src/services/engine.service";
import CatalogoFilter from "../../src/prompts/catalogo.filter";
import PlanoPrompt from "../../src/prompts/plano.prompt";
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

describe("PlanoPrompt", () => {
    const planoPrompt = new PlanoPrompt();
    const catalogoFilter = new CatalogoFilter();
    const resultado = new EngineService().calcular(PERFIL);

    function montar(restricoesAlimentares: string[] = [], restricoesFisicas: string[] = []) {
        return planoPrompt.montar({
            resultado,
            alimentos: catalogoFilter.filtrarAlimentos(restricoesAlimentares),
            exercicios: catalogoFilter.filtrarExercicios(
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
    });

    // Quantas refeições e como o dia se divide entre elas são decisão do
    // usuário + motor determinístico, nunca do modelo: por isso as quatro metas
    // de cada refeição vão prontas no prompt, com os nomes exatos a usar.
    //
    // ATENÇÃO ao custo: exigir os 4 macros por refeição multiplica as restrições
    // simultâneas e faz o raciocínio do modelo crescer — foi por isso que antes
    // só as kcal iam, como orientação. A tolerância de 5% (testada abaixo) é o
    // contrapeso que impede a busca exaustiva; não remover.
    it("manda a meta completa de cada refeição, com o nome exato", () => {
        const { user, system } = montar();

        for (const refeicao of resultado.dieta.refeicoes) {
            expect(user).toContain(
                `${refeicao.nome}: ${refeicao.kcal} kcal | proteína ${refeicao.proteina} g | carboidrato ${refeicao.carboidrato} g | gordura ${refeicao.gordura} g`,
            );
        }

        expect(user).toContain(`# Refeições do dia (${resultado.dieta.numeroRefeicoes} refeições`);
        expect(system).toContain("Monte EXATAMENTE as refeições listadas");
    });

    // Sem saber que 5% é aceitável, o modelo busca a combinação perfeita e
    // queima raciocínio sem controle.
    it("informa a tolerância aceitável para o modelo não buscar precisão exata", () => {
        expect(montar().system).toMatch(
            /até 5% na meta de cada refeição, e no total do dia, é perfeitamente aceitável/i,
        );
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
