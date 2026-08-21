import { AI_EFSA_ML, ML_POR_KG, metaAguaMl } from "../../src/data/hidratacao";
import { NivelAtividade } from "../../src/types/perfil.types";

describe("hidratacao", () => {
    // A regressão que isto impede: META_AGUA_ML = 2000 fixo no mapper dava a
    // mesma meta para um homem de 95 kg atleta e uma mulher de 48 kg sedentária.
    it("escala com o peso, mantido o resto igual", () => {
        const leve = metaAguaMl(60, "M", "moderado");
        const pesado = metaAguaMl(95, "M", "moderado");

        expect(pesado).toBeGreaterThan(leve);
    });

    it("escala com o nível de atividade, mantido o peso igual", () => {
        const niveis: NivelAtividade[] = [
            "sedentario",
            "leve",
            "moderado",
            "intenso",
            "atleta",
        ];
        // Peso alto de propósito: o piso da EFSA não pode mascarar a progressão.
        const metas = niveis.map((nivel) => metaAguaMl(90, "M", nivel));

        for (let i = 1; i < metas.length; i++) {
            expect(metas[i]).toBeGreaterThan(metas[i - 1]);
        }
    });

    describe("piso da EFSA", () => {
        it("protege quem é leve demais para a conta de ml/kg", () => {
            // 48 kg x 35 ml/kg = 1680, abaixo da Ingestão Adequada feminina.
            expect(metaAguaMl(48, "F", "sedentario")).toBe(AI_EFSA_ML.F);
        });

        it("é diferente para homem e mulher", () => {
            expect(AI_EFSA_ML.M).toBeGreaterThan(AI_EFSA_ML.F);
            expect(metaAguaMl(45, "M", "sedentario")).toBe(AI_EFSA_ML.M);
            expect(metaAguaMl(45, "F", "sedentario")).toBe(AI_EFSA_ML.F);
        });

        it("não interfere quando a conta por peso já supera a AI", () => {
            const meta = metaAguaMl(95, "M", "atleta");

            expect(meta).toBeGreaterThan(AI_EFSA_ML.M);
            expect(meta).toBe(4300); // 95 x 45 = 4275, arredondado para 50
        });
    });

    it("arredonda para múltiplos de 50, porque o app registra de 250 em 250", () => {
        const pesos = [48, 53.7, 62, 71.4, 80, 95, 110];

        for (const peso of pesos) {
            for (const sexo of ["M", "F"] as const) {
                expect(metaAguaMl(peso, sexo, "moderado") % 50).toBe(0);
            }
        }
    });

    it("nunca prescreve abaixo da Ingestão Adequada, em nenhuma combinação", () => {
        const niveis: NivelAtividade[] = ["sedentario", "leve", "moderado", "intenso", "atleta"];

        for (const peso of [40, 50, 62, 80, 120]) {
            for (const sexo of ["M", "F"] as const) {
                for (const nivel of niveis) {
                    expect(metaAguaMl(peso, sexo, nivel)).toBeGreaterThanOrEqual(AI_EFSA_ML[sexo]);
                }
            }
        }
    });

    it("a tabela de ml/kg cobre todos os níveis, em ordem crescente", () => {
        const valores = Object.values(ML_POR_KG);

        expect(valores).toHaveLength(5);
        expect([...valores].sort((a, b) => a - b)).toEqual(valores);
    });
});
