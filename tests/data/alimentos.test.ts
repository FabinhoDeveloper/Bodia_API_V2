import { ALIMENTOS } from "../../src/data/alimentos";

/**
 * O catálogo é um recorte da TACO gerado por scripts/importar-taco.ts. Estes
 * testes travam o resultado das regras de exclusão: se alguém mexer nas regras
 * e reintroduzir bolo ou arroz cru, quebra aqui — e não no prompt, silenciosamente.
 */
describe("catálogo de alimentos", () => {
    const nomes = ALIMENTOS.map((a) => a.nome).join("\n");

    it("mantém uma lista enxuta o suficiente para caber no prompt", () => {
        // A TACO completa tem 591 itens com energia; injetar tudo fazia o modelo
        // queimar raciocínio sem controle procurando a combinação certa.
        expect(ALIMENTOS.length).toBeGreaterThan(200);
        expect(ALIMENTOS.length).toBeLessThan(350);
    });

    it("não traz doces, ultraprocessados nem bebidas", () => {
        expect(nomes).not.toMatch(/bolo|biscoito|refrigerante|cerveja|chocolate|salsicha|mortadela/i);
    });

    it("não traz item cru que precise de cozimento", () => {
        const crusIndevidos = ALIMENTOS.filter(
            (a) =>
                [
                    "Cereais e derivados",
                    "Leguminosas e derivados",
                    "Carnes e derivados",
                    "Pescados e frutos do mar",
                    "Ovos e derivados",
                ].includes(a.categoria) &&
                /,\s*cr[ua]/i.test(a.nome) &&
                !/aveia|amendoim|castanha|noz/i.test(a.nome),
        );

        expect(crusIndevidos).toEqual([]);
    });

    // Ovo cru chegou a ser prescrito num plano real antes de a categoria de ovos
    // entrar na regra de cozimento.
    it("não traz ovo cru", () => {
        expect(nomes).not.toMatch(/Ovo.*cr[ua]/i);
    });

    // Fruta e hortaliça crua é como se come — não pode sair junto.
    it("mantém frutas e verduras cruas", () => {
        expect(nomes).toMatch(/Alface.*crua|Tomate.*cru/i);
    });

    it("mantém a base do prato brasileiro e as fontes de proteína", () => {
        for (const essencial of [
            "Arroz, tipo 1, cozido",
            "Feijão, carioca, cozido",
            "Frango, peito, sem pele, grelhado",
            "Ovo, de galinha, inteiro, cozido",
            "Pão, trigo, francês",
        ]) {
            expect(nomes).toContain(essencial);
        }
    });

    it("mantém os ids da TACO, que servirão de chave estrangeira", () => {
        expect(ALIMENTOS.every((a) => Number.isInteger(a.id) && a.id > 0)).toBe(true);
        expect(new Set(ALIMENTOS.map((a) => a.id)).size).toBe(ALIMENTOS.length);
    });

    it("não tem alimento sem energia", () => {
        expect(ALIMENTOS.filter((a) => a.kcal <= 0)).toEqual([]);
    });
});
