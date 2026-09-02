import { ALIMENTOS } from "../../src/data/alimentos";
import { faixaDe, PAPEIS_PROTEICOS, papelDe } from "../../src/data/porcoes";

/** Os que o comentário do arquivo cita nominalmente como casos difíceis. */
const ARROZ_COZIDO = 3;
const FARINHA_DE_MANDIOCA_TORRADA = 122;
const AZEITE = 260;
const QUEIJO_MINAS = 461;
const AMENDOIM = 557;

function por(id: number) {
    return ALIMENTOS.find((a) => a.id === id)!;
}

describe("porcoes", () => {
    // Um alimento sem faixa quebraria o solver na hora de resolver a refeição
    // que o contém, e só em produção, para o usuário azarado que recebesse
    // aquele item — daí a varredura no catálogo inteiro.
    describe("cobertura do catálogo", () => {
        it("resolve papel e faixa para todos os alimentos", () => {
            for (const alimento of ALIMENTOS) {
                expect(papelDe(alimento)).toBeTruthy();
                expect(faixaDe(alimento)).toBeTruthy();
            }
        });

        it("mantém min < usual < max em todas as faixas", () => {
            for (const alimento of ALIMENTOS) {
                const { min, usual, max } = faixaDe(alimento);

                expect(min).toBeLessThan(usual);
                expect(usual).toBeLessThan(max);
                expect(min).toBeGreaterThan(0);
            }
        });
    });

    describe("faixa pela densidade energética", () => {
        // O teto que impede o sintoma: o plano medido trazia 400 g de arroz num
        // almoço e 500 g num jantar.
        it("dá ao arroz cozido um prato grande, mas não 400 g", () => {
            expect(faixaDe(por(ARROZ_COZIDO)).max).toBe(250);
        });

        it("dá ao azeite um fio, não uma porção", () => {
            expect(faixaDe(por(AZEITE)).max).toBeLessThanOrEqual(30);
        });

        it("encolhe a porção conforme o alimento concentra energia", () => {
            const arroz = faixaDe(por(ARROZ_COZIDO)); // 128 kcal/100 g
            const farinha = faixaDe(por(FARINHA_DE_MANDIOCA_TORRADA)); // 365
            const azeite = faixaDe(por(AZEITE)); // 884

            expect(arroz.usual).toBeGreaterThan(farinha.usual);
            expect(farinha.usual).toBeGreaterThan(azeite.usual);
        });
    });

    describe("onde a categoria da TACO engana", () => {
        // A mandioca é raiz, então a TACO põe a farinha dela em "Verduras,
        // hortaliças e derivados", ao lado da alface. Com o papel VEGETAL e sua
        // faixa própria, a farofa chegava a 200 g num prato.
        it("trata a farinha de mandioca como base de carboidrato, não verdura", () => {
            expect(papelDe(por(FARINHA_DE_MANDIOCA_TORRADA))).toBe("BASE_CARBO");
            expect(faixaDe(por(FARINHA_DE_MANDIOCA_TORRADA)).max).toBeLessThanOrEqual(60);
        });

        // Amendoim está em "Leguminosas e derivados", ao lado do feijão. Sem o
        // ajuste, a conferência de cobertura aceitaria um almoço cuja base de
        // carboidrato é um punhado de amendoim.
        it("trata o amendoim como gordura, não como leguminosa", () => {
            expect(papelDe(por(AMENDOIM))).toBe("GORDURA");
        });

        it("dá ao queijo porção de queijo, e não de pão", () => {
            expect(faixaDe(por(QUEIJO_MINAS)).max).toBeLessThanOrEqual(100);
        });
    });

    it("conta laticínio como fonte de proteína", () => {
        expect(PAPEIS_PROTEICOS).toContain(papelDe(por(QUEIJO_MINAS)));
    });
});
