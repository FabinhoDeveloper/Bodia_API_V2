import {
    DIFICULDADES,
    Dificuldade,
    cabeNoTeto,
    dificuldadeDe,
    proximoTeto,
} from "../../src/data/dificuldade-treino";
import { EXERCICIOS } from "../../src/data/exercicios";
import { DIFICULDADE_POR_NIVEL, GRUPOS_POR_SESSAO } from "../../src/data/volume-treino";

const acharPorNome = (nome: string) => EXERCICIOS.find((e) => e.nome === nome)!;

describe("dificuldade-treino", () => {
    // A regressão que isto impede: gerando um plano para uma INICIANTE, o treino
    // vinha com agachamento livre com barra e supino com barra. Para o seletor,
    // eles eram indistinguíveis de uma cadeira extensora.
    it.each([
        // Barra em grupo grande — o que sai do catálogo de um iniciante.
        ["Agachamento livre com barra", "DIFICIL"],
        ["Supino reto com barra", "DIFICIL"],
        ["Levantamento terra", "DIFICIL"],
        ["Desenvolvimento militar com barra", "DIFICIL"],
        ["Stiff com barra", "DIFICIL"],
        // Guiado — fácil em qualquer grupo.
        ["Cadeira extensora", "FACIL"],
        ["Leg press 45 graus", "FACIL"],
        ["Supino reto na máquina", "FACIL"],
        ["Puxada frente na polia", "FACIL"],
        ["Agachamento no smith", "FACIL"],
        // Halter e peso corporal em grupo grande: exigem estabilizar, mas a
        // carga é menor e o movimento, mais curto.
        ["Supino reto com halteres", "MEDIO"],
        ["Remada unilateral com halter", "MEDIO"],
        ["Flexão de braço", "MEDIO"],
        // Barra em grupo pequeno continua entrando para o iniciante — é o que
        // mantém a prescrição alinhada ao "inclua peso livre E máquina em todos
        // os níveis" do ACSM.
        ["Rosca direta com barra", "MEDIO"],
        ["Tríceps testa com barra W", "MEDIO"],
    ])("'%s' é %s", (nome, esperada) => {
        expect(dificuldadeDe(acharPorNome(nome))).toBe(esperada);
    });

    // As exceções nomeadas: onde a regra equipamento x grupo erra.
    it.each([
        // Peso corporal em grupo grande daria MEDIO pela regra, mas exigem
        // levantar o próprio corpo — a iniciante média não faz uma repetição.
        ["Barra fixa pronada", "DIFICIL"],
        ["Mergulho em paralelas", "DIFICIL"],
        // Catalogado em Tríceps (grupo pequeno), daria MEDIO — mas é uma prensa
        // multiarticular com barra livre.
        ["Supino fechado", "DIFICIL"],
        // Barra em grupo grande daria DIFICIL, mas tronco apoiado e amplitude
        // curta: é o exercício de glúteo que se indica para começar.
        ["Elevação pélvica (hip thrust)", "MEDIO"],
        // Peso corporal em grupo pequeno daria FACIL, mas exigem sustentar o
        // corpo suspenso ou fora do apoio.
        ["Elevação de joelhos suspenso", "MEDIO"],
    ])("'%s' é exceção da regra e vale %s", (nome, esperada) => {
        expect(dificuldadeDe(acharPorNome(nome))).toBe(esperada);
    });

    it("classifica todo exercício do catálogo", () => {
        for (const exercicio of EXERCICIOS) {
            expect(DIFICULDADES).toContain(dificuldadeDe(exercicio));
        }
    });

    // Se uma das faixas ficasse quase vazia, a régua não estaria separando nada.
    it.each(DIFICULDADES)("existe exercício em quantidade relevante em %s", (dificuldade) => {
        const quantos = EXERCICIOS.filter((e) => dificuldadeDe(e) === dificuldade).length;

        expect(quantos).toBeGreaterThanOrEqual(10);
    });

    /**
     * A garantia que sustenta o corte: nos splits que separam os grupos, o teto
     * do iniciante nunca deixa um grupo COM ORÇAMENTO sem exercício. Sem isso, o
     * recorte por nível dependeria da válvula de folga do CatalogoFilter para
     * funcionar no caso normal — e ela existe para o caso raro.
     */
    it.each(["Upper", "Lower", "Push", "Pull", "Legs"])(
        "todo grupo orçado de %s tem exercício para iniciante",
        (sessao) => {
            const { primario, secundario } = GRUPOS_POR_SESSAO[sessao];

            for (const grupo of [...primario, ...secundario]) {
                const disponiveis = EXERCICIOS.filter(
                    (e) =>
                        e.grupoMuscular === grupo &&
                        e.sessoes.includes(sessao as never) &&
                        cabeNoTeto(dificuldadeDe(e), DIFICULDADE_POR_NIVEL.iniciante),
                );

                expect(`${grupo}: ${disponiveis.length}`).not.toBe(`${grupo}: 0`);
            }
        },
    );

    /**
     * A EXCEÇÃO, documentada em vez de escondida: no split de 2 dias (Corpo
     * inteiro), posterior de coxa fica sem exercício para o iniciante.
     *
     * A causa é do catálogo, não da régua: dos seis exercícios de posterior, o
     * único marcado para "Corpo inteiro" é o stiff com barra — os três flexores
     * de máquina não são. E não dá para simplesmente marcá-los: `sessoes`
     * carrega DOIS significados, "cabe num full body" e, em
     * `descanso-treino.ts`, "é multiarticular" — marcar a mesa flexora daria a
     * ela 120 s de descanso, que é errado.
     *
     * Enquanto for assim, o `CatalogoFilter` relaxa o teto nesse grupo e o
     * iniciante de 2 dias recebe o stiff. Este teste falha no dia em que o
     * catálogo melhorar, e aí é só apagá-lo.
     */
    it("posterior de coxa fica sem opção fácil no split de Corpo inteiro", () => {
        const disponiveis = EXERCICIOS.filter(
            (e) =>
                e.grupoMuscular === "Posterior de coxa" &&
                e.sessoes.includes("Corpo inteiro") &&
                cabeNoTeto(dificuldadeDe(e), DIFICULDADE_POR_NIVEL.iniciante),
        );

        expect(disponiveis).toHaveLength(0);
    });

    describe("cabeNoTeto", () => {
        it.each([
            ["FACIL", "MEDIO", true],
            ["MEDIO", "MEDIO", true],
            ["DIFICIL", "MEDIO", false],
            ["DIFICIL", "DIFICIL", true],
        ])("%s sob teto %s: %s", (dificuldade, teto, esperado) => {
            expect(cabeNoTeto(dificuldade as Dificuldade, teto as Dificuldade)).toBe(esperado);
        });
    });

    describe("proximoTeto", () => {
        it("sobe um degrau", () => {
            expect(proximoTeto("FACIL")).toBe("MEDIO");
            expect(proximoTeto("MEDIO")).toBe("DIFICIL");
        });

        // Sem isto, relaxar o teto no topo sairia da lista e daria undefined.
        it("para no topo", () => {
            expect(proximoTeto("DIFICIL")).toBe("DIFICIL");
        });
    });
});
