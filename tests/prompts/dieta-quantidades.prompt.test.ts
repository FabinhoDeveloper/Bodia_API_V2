import { ALIMENTOS } from "../../src/data/alimentos";
import EngineService from "../../src/services/engine.service";
import DietaQuantidadesPrompt from "../../src/prompts/dieta-quantidades.prompt";
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

const acharAlimento = (id: number) => ALIMENTOS.find((a) => a.id === id)!;

describe("DietaQuantidadesPrompt", () => {
    const prompt = new DietaQuantidadesPrompt();
    const resultado = new EngineService().calcular(PERFIL);

    const selecionadas = resultado.dieta.refeicoes.map((refeicao) => ({
        nome: refeicao.nome,
        alimentos: [acharAlimento(3), acharAlimento(410)],
    }));

    const montar = () => prompt.montar({ resultado, refeicoes: selecionadas });

    it("proíbe trocar, acrescentar ou remover alimento já escolhido", () => {
        const { system } = montar();

        expect(system).toContain("Use TODOS os alimentos recebidos");
        expect(system).toContain("Não acrescente, não remova, não troque");
    });

    it("proíbe alterar a meta recebida", () => {
        const { system } = montar();

        expect(system).toContain("NUNCA altere, arredonde ou \"corrija\" uma meta");
    });

    // É o motivo desta chamada existir: o espaço de busca encolheu de 591
    // alimentos para o punhado de cada refeição.
    it("envia SÓ os alimentos selecionados, não o catálogo inteiro", () => {
        const { user } = montar();

        expect(user).toContain("Arroz, tipo 1, cozido");
        expect(user).toContain("Frango, peito, sem pele, grelhado");
        // Um alimento real da TACO que não foi selecionado não pode aparecer.
        expect(user).not.toContain("Batata, doce, cozida");

        // Duas linhas de alimento por refeição, e nada além disso.
        const linhasDeAlimento = user.split("\n").filter((l) => /^\d+\|/.test(l));
        expect(linhasDeAlimento).toHaveLength(selecionadas.length * 2);
    });

    it("dá a meta completa de cada refeição, não só a calórica", () => {
        const { user } = montar();

        for (const refeicao of resultado.dieta.refeicoes) {
            expect(user).toContain(
                `## ${refeicao.nome} — meta: ${refeicao.kcal} kcal | proteína ${refeicao.proteina} g`,
            );
        }
    });

    it("cita a literatura dos macros, e não a de treino", () => {
        const { system } = montar();

        expect(system).toContain("JÄGER et al., 2017");
        expect(system).toContain("MIFFLIN et al., 1990");
        // Volume de treino não tem nada a ver com esta chamada.
        expect(system).not.toContain("PELLAND");
        expect(system).not.toContain("SCHOENFELD");
    });

    it("libera 5% de desvio para o modelo não gastar tempo buscando o exato", () => {
        const { system } = montar();

        expect(system).toContain("até 5%");
        expect(system).toContain("NÃO procure a combinação matematicamente perfeita");
    });

    it("pede a resposta em json com alimentoId e gramas", () => {
        const { system } = montar();

        expect(system).toContain("alimentoId");
        expect(system).toContain("gramas");
        expect(system).toMatch(/json/i);
    });
});
