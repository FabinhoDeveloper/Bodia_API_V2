import { ALIMENTOS } from "../../src/data/alimentos";
import { faixaDe } from "../../src/data/porcoes";
import PorcoesSolver, { MetaRefeicao } from "../../src/generators/porcoes.solver";

const ARROZ = 3; // 128.26 kcal, P 2.52, C 28.06, G 0.23
const FEIJAO = 567; // 77.03 kcal, P 4.48, C 14.01, G 0.54
const FRANGO = 410; // 159.19 kcal, P 32.03, C 0, G 2.48
const BROCOLIS = 100; // 24.86 kcal, P 2.13, C 4.37, G 0.32
const AZEITE = 260; // 884 kcal, P 0, C 0, G 100
const FAROFA = 122; // 365.13 kcal, P 1.61, C 87.87, G 1.4 — a farinha de mandioca
const ALFACE = 91;

function por(...ids: number[]) {
    return ids.map((id) => ALIMENTOS.find((a) => a.id === id)!);
}

/** Recalcula o prato a partir da TACO, como o validador-macros faz. */
function somar(alimentos: ReturnType<typeof por>, porcoes: { alimentoId: number; gramas: number }[]) {
    const total = { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 };

    for (const porcao of porcoes) {
        const alimento = alimentos.find((a) => a.id === porcao.alimentoId)!;
        const fator = porcao.gramas / 100;

        total.kcal += alimento.kcal * fator;
        total.proteina += alimento.proteina * fator;
        total.carboidrato += alimento.carboidrato * fator;
        total.gordura += alimento.gordura * fator;
    }

    return total;
}

function desvio(obtido: number, meta: number) {
    return Math.abs(obtido - meta) / meta;
}

describe("PorcoesSolver", () => {
    const solver = new PorcoesSolver();

    // O caso que originou o trabalho: o almoço do perfil real, cuja meta é
    // 1014 kcal / P 51 / C 139 / G 28, e que a IA fechava com 400 g de arroz.
    const ALMOCO: MetaRefeicao = { kcal: 1014, proteina: 51, carboidrato: 139, gordura: 28 };

    describe("almoço brasileiro completo", () => {
        // Arroz, feijão, frango, legume, azeite E farofa. O carboidrato denso é
        // o que torna a meta alcançável: sem ele, arroz e feijão precisariam ir
        // aos 250 g cada e ainda ficariam 18% abaixo dos 139 g pedidos — ver o
        // teste de infeasibilidade adiante.
        const alimentos = por(ARROZ, FEIJAO, FRANGO, BROCOLIS, AZEITE, FAROFA);
        const porcoes = solver.resolver(alimentos, ALMOCO);
        const total = somar(alimentos, porcoes);

        it("fecha os quatro alvos dentro da tolerância do validador", () => {
            expect(desvio(total.kcal, ALMOCO.kcal)).toBeLessThan(0.05);
            expect(desvio(total.proteina, ALMOCO.proteina)).toBeLessThan(0.05);
            expect(desvio(total.carboidrato, ALMOCO.carboidrato)).toBeLessThan(0.05);
            expect(desvio(total.gordura, ALMOCO.gordura)).toBeLessThan(0.05);
        });

        it("serve o arroz num prato de comer, não em 400 g", () => {
            const arroz = porcoes.find((p) => p.alimentoId === ARROZ)!;

            expect(arroz.gramas).toBeLessThanOrEqual(250);
        });
    });

    it("nunca sai da faixa de nenhum alimento", () => {
        const alimentos = por(ARROZ, FEIJAO, FRANGO, BROCOLIS, AZEITE, FAROFA);

        // Metas absurdas nas duas direções: é onde um solver sem limite estoura.
        for (const meta of [
            ALMOCO,
            { kcal: 60, proteina: 3, carboidrato: 8, gordura: 2 },
            { kcal: 4000, proteina: 300, carboidrato: 600, gordura: 150 },
        ]) {
            for (const porcao of solver.resolver(alimentos, meta)) {
                const faixa = faixaDe(alimentos.find((a) => a.id === porcao.alimentoId)!);

                expect(porcao.gramas).toBeGreaterThanOrEqual(faixa.min);
                expect(porcao.gramas).toBeLessThanOrEqual(faixa.max);
            }
        }
    });

    // A razão de o solver ser descida coordenada sobre um custo global, e não o
    // fecho de um macro por vez: sem fonte de gordura, perseguir a gordura em
    // sequência levava o frango ao teto e a proteína a +51%.
    it("não sacrifica os outros alvos por um alvo inalcançável", () => {
        const alimentos = por(ARROZ, FEIJAO, FRANGO, BROCOLIS, FAROFA); // sem azeite
        const total = somar(alimentos, solver.resolver(alimentos, ALMOCO));

        // A gordura não fecha: nenhum destes alimentos a tem em quantidade.
        expect(desvio(total.gordura, ALMOCO.gordura)).toBeGreaterThan(0.05);

        // Mas os outros três não desabam. Faltando 28 g de gordura, o custo
        // aceita ceder um pouco nos demais para recuperar caloria — medido, os
        // três ficam dentro de 15%, acima da tolerância do validador (que vai
        // reportar) e longe do que a versão sequencial fazia: perseguindo a
        // gordura macro a macro, ela levava o frango ao teto de 250 g e a
        // proteína a +51%.
        expect(desvio(total.proteina, ALMOCO.proteina)).toBeLessThan(0.15);
        expect(desvio(total.carboidrato, ALMOCO.carboidrato)).toBeLessThan(0.15);
        expect(desvio(total.kcal, ALMOCO.kcal)).toBeLessThan(0.15);
    });

    // Não é falha do solver: 139 g de carboidrato num almoço não cabem em arroz,
    // feijão e legume dentro de porções de comer. Quem reporta a diferença é o
    // validador-macros, e a resposta certa é a seleção trazer um carboidrato
    // denso — farofa, pão ou macarrão —, como um prato brasileiro traz.
    it("para nos tetos quando falta carboidrato denso, sem estourá-los", () => {
        const alimentos = por(ARROZ, FEIJAO, FRANGO, BROCOLIS, AZEITE);
        const porcoes = solver.resolver(alimentos, ALMOCO);
        const total = somar(alimentos, porcoes);

        expect(total.carboidrato).toBeLessThan(ALMOCO.carboidrato);
        expect(porcoes.find((p) => p.alimentoId === ARROZ)!.gramas).toBe(
            faixaDe(por(ARROZ)[0]).max,
        );
    });

    it("para nos limites quando a meta não cabe, em vez de estourar a faixa", () => {
        const alimentos = por(ALFACE, BROCOLIS);
        const porcoes = solver.resolver(alimentos, ALMOCO);
        const total = somar(alimentos, porcoes);

        // Um almoço de 1000 kcal montado com folhas é impossível, e o solver
        // entrega o prato possível — quem reporta a diferença é o validador.
        expect(total.kcal).toBeLessThan(ALMOCO.kcal);
        for (const porcao of porcoes) {
            const faixa = faixaDe(alimentos.find((a) => a.id === porcao.alimentoId)!);
            expect(porcao.gramas).toBeLessThanOrEqual(faixa.max);
        }
    });

    it("devolve gramas que se possa servir, sem casas decimais", () => {
        const alimentos = por(ARROZ, FEIJAO, FRANGO, BROCOLIS, AZEITE, FAROFA);

        for (const porcao of solver.resolver(alimentos, ALMOCO)) {
            expect(Number.isInteger(porcao.gramas)).toBe(true);

            // Múltiplo de 5 para o que se serve às colheradas; o azeite anda de
            // grama em grama, porque 5 g dele são 18% da meta de gordura.
            const passoGrosso = faixaDe(
                alimentos.find((a) => a.id === porcao.alimentoId)!,
            ).max > 30;
            if (passoGrosso) expect(porcao.gramas % 5).toBe(0);
        }
    });

    // É o ganho central sobre a chamada à IA: o mesmo perfil produz o mesmo
    // prato, e um plano regenerado sem mudar nada não vem diferente.
    it("é determinístico", () => {
        const alimentos = por(ARROZ, FEIJAO, FRANGO, BROCOLIS, AZEITE, FAROFA);

        expect(solver.resolver(alimentos, ALMOCO)).toEqual(solver.resolver(alimentos, ALMOCO));
    });

    it("devolve uma porção por alimento recebido, e só esses", () => {
        const alimentos = por(ARROZ, FRANGO, AZEITE);
        const porcoes = solver.resolver(alimentos, ALMOCO);

        expect(porcoes.map((p) => p.alimentoId)).toEqual([ARROZ, FRANGO, AZEITE]);
    });
});
