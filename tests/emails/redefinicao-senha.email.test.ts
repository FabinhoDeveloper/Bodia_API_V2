import { montarEmailRedefinicao } from "../../src/emails/redefinicao-senha.email";

const LINK = "https://bodia.teste/redefinir-senha#token=abc_DEF-123";

describe("montarEmailRedefinicao", () => {
    it("leva o link no texto e no HTML", () => {
        const { texto, html } = montarEmailRedefinicao({ nome: "Ana", link: LINK, validadeMin: 30 });

        expect(texto).toContain(LINK);
        expect(html).toContain(`href="${LINK}"`);
    });

    it("diz por quanto tempo o link vale e que é de uso único", () => {
        const { texto, html } = montarEmailRedefinicao({ nome: "Ana", link: LINK, validadeMin: 30 });

        for (const corpo of [texto, html]) {
            expect(corpo).toContain("30 minutos");
            expect(corpo).toContain("uma vez");
        }
    });

    // O nome é digitado no cadastro: sem escapar, viraria marcação no e-mail.
    it("escapa o nome no HTML", () => {
        const { html } = montarEmailRedefinicao({
            nome: '<img src=x onerror="alert(1)">',
            link: LINK,
            validadeMin: 30,
        });

        expect(html).not.toContain("<img");
        expect(html).toContain("&lt;img");
    });
});
