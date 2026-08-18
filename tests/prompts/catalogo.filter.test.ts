import ValidationError from "../../src/errors/ValidationError";
import CatalogoFilter from "../../src/prompts/catalogo.filter";

describe("CatalogoFilter", () => {
    const catalogoFilter = new CatalogoFilter();

    const contem = (itens: { nome: string }[], trecho: string) =>
        itens.some((item) => item.nome.includes(trecho));

    describe("filtrarAlimentos", () => {
        it("devolve o catálogo inteiro quando não há restrição", () => {
            expect(catalogoFilter.filtrarAlimentos([]).length).toBeGreaterThan(250);
        });

        it("remove todo alimento de origem animal para veganos", () => {
            const alimentos = catalogoFilter.filtrarAlimentos(["Vegano"]);

            // "Soja, queijo (tofu)" e "Leite, de coco" citam laticínio no nome mas
            // são vegetais — ficam de fora da checagem de propósito.
            expect(
                alimentos.filter((a) =>
                    /carne|frango|peixe|camarão|leite, de vaca|iogurte|ovo, de|queijo,/i.test(a.nome),
                ),
            ).toEqual([]);
            expect(alimentos.length).toBeGreaterThan(150);
        });

        it("remove carnes mas mantém laticínios e ovos para vegetarianos", () => {
            const alimentos = catalogoFilter.filtrarAlimentos(["Vegetariano"]);

            expect(alimentos.filter((a) => /frango|carne, bovina/i.test(a.nome))).toEqual([]);
            expect(contem(alimentos, "Queijo, mozarela")).toBe(true);
        });

        it("remove laticínios para intolerantes a lactose", () => {
            const alimentos = catalogoFilter.filtrarAlimentos(["Lactose"]);

            expect(contem(alimentos, "Queijo, mozarela")).toBe(false);
            expect(contem(alimentos, "Manteiga, com sal")).toBe(false);
        });

        // Alimento vegetal cujo nome contém palavra de laticínio não pode ser
        // removido por engano — perder a couve não protege ninguém.
        it("mantém vegetais cujo nome contém palavra de laticínio", () => {
            expect(contem(catalogoFilter.filtrarAlimentos(["Lactose"]), "Couve, manteiga")).toBe(true);
            expect(contem(catalogoFilter.filtrarAlimentos(["Vegano"]), "Leite, de coco")).toBe(true);
            expect(contem(catalogoFilter.filtrarAlimentos(["Vegano"]), "Soja, queijo")).toBe(true);
        });

        it("remove derivados de trigo para celíacos e amendoim para alérgicos", () => {
            const semGluten = catalogoFilter.filtrarAlimentos(["Glúten"]);
            expect(semGluten.filter((a) => /pão|macarrão|farinha, de trigo/i.test(a.nome))).toEqual([]);

            const semAmendoim = catalogoFilter.filtrarAlimentos(["Amendoim"]);
            expect(semAmendoim.filter((a) => /amendoim|paçoca/i.test(a.nome))).toEqual([]);
        });

        it("acumula restrições combinadas", () => {
            const alimentos = catalogoFilter.filtrarAlimentos(["Vegano", "Glúten"]);

            expect(alimentos.filter((a) => /frango|pão|queijo,/i.test(a.nome))).toEqual([]);
            expect(alimentos.length).toBeGreaterThan(0);
        });
    });

    describe("filtrarExercicios", () => {
        it("mantém apenas exercícios que servem às sessões do split", () => {
            const exercicios = catalogoFilter.filtrarExercicios([], ["Push"]);

            expect(exercicios.length).toBeGreaterThan(0);
            expect(exercicios.every((e) => e.sessoes.includes("Push"))).toBe(true);
        });

        it("remove exercícios que carregam a articulação lesionada", () => {
            const exercicios = catalogoFilter.filtrarExercicios(["Joelho"], ["Legs"]);

            expect(exercicios.every((e) => !e.articulacoes.includes("Joelho"))).toBe(true);
            expect(contem(exercicios, "Agachamento livre")).toBe(false);
            expect(exercicios.length).toBeGreaterThan(0);
        });

        it("recusa montar a sessão quando as lesões não deixam nenhum exercício", () => {
            expect(() =>
                catalogoFilter.filtrarExercicios(["Ombro", "Cotovelo", "Punho"], ["Push"]),
            ).toThrow(ValidationError);
        });
    });
});
