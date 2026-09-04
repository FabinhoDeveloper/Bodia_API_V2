import EngineService from "../../src/services/engine.service";
import CatalogoFilter from "../../src/prompts/catalogo.filter";
import TreinoPrompt from "../../src/prompts/treino.prompt";
import {
    MAX_EXERCICIOS_POR_SESSAO,
    MAX_SERIES_POR_EXERCICIO,
    MIN_EXERCICIOS_POR_SESSAO,
} from "../../src/data/volume-treino";
import { NivelExperiencia, PerfilInput } from "../../src/types/perfil.types";

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

    function montar(restricoesFisicas: string[] = [], nivel?: NivelExperiencia) {
        return prompt.montar({
            resultado,
            exercicios: catalogoFilter.filtrarExercicios(
                restricoesFisicas,
                resultado.treino.sessoes.map((s) => s.nome),
                nivel,
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

        expect(system).toContain(
            `Entre ${MIN_EXERCICIOS_POR_SESSAO} e ${MAX_EXERCICIOS_POR_SESSAO} exercícios por sessão`,
        );
        expect(system).toContain(
            `NUNCA mais que ${MAX_SERIES_POR_EXERCICIO} séries no mesmo exercício`,
        );
    });

    // O prompt pedia ao modelo dividir o volume semanal pela frequência. Isso
    // era aritmética no lugar errado — e, pior, o resultado não cabia nos
    // próprios limites em 13 das 15 combinações de dias x nível.
    it("entrega o orçamento pronto e proíbe redistribuir", () => {
        const { system } = montar();

        expect(system).toContain("NÃO divida, NÃO multiplique, NÃO redistribua");
        expect(system).toContain("já está dividido pela frequência semanal");
        expect(system).not.toContain("TOTAL a ser DISTRIBUÍDO");
    });

    it("lista as séries de cada grupo em cada sessão, já divididas", () => {
        const { user } = montar();

        for (const sessao of resultado.treino.sessoes) {
            expect(user).toContain(`## ${sessao.nome} (${sessao.frequenciaSemanal}x por semana)`);

            for (const item of sessao.volume) {
                expect(user).toContain(`${item.grupo}: ${item.series} séries`);
            }
        }
    });

    it("não manda mais o total semanal a distribuir", () => {
        const { user } = montar();

        expect(user).not.toContain("total a distribuir");
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

    // O corte por nível é do CÓDIGO, não do prompt: o modelo não recebe coluna
    // de dificuldade nem instrução de preferência. Ele não pode violar uma regra
    // sobre um exercício que nunca viu — a mesma razão do catalogo.filter.
    it("não envia ao iniciante o exercício acima do nível dele", () => {
        const iniciante = montar([], "iniciante").user;
        const avancado = montar([], "avancado").user;

        expect(iniciante).not.toContain("Agachamento livre com barra");
        expect(iniciante).not.toContain("Supino reto com barra");
        expect(avancado).toContain("Agachamento livre com barra");
        expect(iniciante.length).toBeLessThan(avancado.length);
    });

    // A frase precisa continuar verdadeira: a lista agora é filtrada por dois
    // critérios, não um.
    it("avisa o modelo de que a lista já vem filtrada pelo nível", () => {
        expect(montar([], "iniciante").system).toContain("nível de experiência");
    });

    it("pede a resposta em json com exercicioId, séries e repetições", () => {
        const { system } = montar();

        expect(system).toContain("exercicioId");
        expect(system).toContain("repeticoes");
        expect(system).toMatch(/json/i);
    });
});
