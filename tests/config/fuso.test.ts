import { diaISO, interpretarDia, janelaDaSemana, janelaDoDia } from "../../src/config/fuso";

/**
 * O motivo destes testes existirem: o servidor roda em UTC e o usuário não.
 * Se a janela do dia fosse a data UTC, a água bebida à noite cairia no dia
 * seguinte — que é exatamente o bug que este módulo evita.
 */
describe("fuso", () => {
    // A semana existe porque o treino é prescrito por semana: a tela mostra um
    // card por dia e marca os feitos. Começar no domingo, como `getDay()`,
    // partiria ao meio a semana de treino de quem treina segunda a sexta.
    describe("janelaDaSemana", () => {
        it("começa na segunda-feira, às 03:00Z", () => {
            // 2026-08-19 é uma quarta-feira.
            const { de, ate } = janelaDaSemana(new Date("2026-08-19T15:00:00.000Z"));

            expect(de.toISOString()).toBe("2026-08-17T03:00:00.000Z");
            expect(ate.toISOString()).toBe("2026-08-24T03:00:00.000Z");
        });

        it("mantém o DOMINGO na semana que acabou, e não na que começa", () => {
            // 2026-08-23 é domingo: pertence à semana aberta em 17/08.
            const { de } = janelaDaSemana(new Date("2026-08-23T15:00:00.000Z"));

            expect(de.toISOString()).toBe("2026-08-17T03:00:00.000Z");
        });

        it("dá a mesma janela para qualquer dia da mesma semana", () => {
            const segunda = janelaDaSemana(new Date("2026-08-17T15:00:00.000Z"));
            const domingo = janelaDaSemana(new Date("2026-08-23T15:00:00.000Z"));

            expect(segunda).toEqual(domingo);
        });

        it("cobre exatamente sete dias", () => {
            const { de, ate } = janelaDaSemana(new Date("2026-08-19T15:00:00.000Z"));

            expect(ate.getTime() - de.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
        });

        // A segunda-feira 00:30 em Brasília é 03:30Z da SEGUNDA — se o corte
        // usasse o dia UTC, o treino cairia na semana anterior.
        it("põe o treino da madrugada de segunda na semana que começa", () => {
            const { de } = janelaDaSemana(new Date("2026-08-17T03:30:00.000Z"));

            expect(de.toISOString()).toBe("2026-08-17T03:00:00.000Z");
        });
    });

    describe("janelaDoDia", () => {
        it("abre o dia às 03:00Z, que é a meia-noite de Brasília", () => {
            const { de, ate } = janelaDoDia(new Date("2026-08-19T15:00:00.000Z"));

            expect(de.toISOString()).toBe("2026-08-19T03:00:00.000Z");
            expect(ate.toISOString()).toBe("2026-08-20T03:00:00.000Z");
        });

        it("põe a ceia das 22h no dia em que o usuário a comeu, não no seguinte", () => {
            // 01:12Z do dia 19 é 22:12 do dia 18 em Brasília.
            const { de, ate } = janelaDoDia(new Date("2026-08-19T01:12:00.000Z"));

            expect(de.toISOString()).toBe("2026-08-18T03:00:00.000Z");
            expect(ate.toISOString()).toBe("2026-08-19T03:00:00.000Z");
        });

        it("dá a mesma janela para dois instantes do mesmo dia local", () => {
            const manha = janelaDoDia(new Date("2026-08-19T12:00:00.000Z"));
            const noite = janelaDoDia(new Date("2026-08-20T02:59:59.000Z"));

            expect(manha).toEqual(noite);
        });

        it("fecha a janela com limite exclusivo, para a meia-noite não cair em dois dias", () => {
            const dia18 = janelaDoDia(new Date("2026-08-18T12:00:00.000Z"));
            const dia19 = janelaDoDia(new Date("2026-08-19T12:00:00.000Z"));

            // O fim de um é exatamente o início do outro: quem usa `lt` não
            // conta a mesma linha duas vezes.
            expect(dia18.ate.toISOString()).toBe(dia19.de.toISOString());
        });

        it("vira o mês e o ano corretamente", () => {
            const viradaDeAno = janelaDoDia(new Date("2026-01-01T02:00:00.000Z"));

            // 23h de 31/12 em Brasília ainda é 31/12.
            expect(viradaDeAno.de.toISOString()).toBe("2025-12-31T03:00:00.000Z");
        });
    });

    describe("diaISO", () => {
        it.each([
            ["2026-08-19T15:00:00.000Z", "2026-08-19"],
            // 22:12 do dia 18 em Brasília.
            ["2026-08-19T01:12:00.000Z", "2026-08-18"],
            // 00:30 do dia 19 em Brasília, já é o dia 19.
            ["2026-08-19T03:30:00.000Z", "2026-08-19"],
        ])("traduz %s em %s", (instante, esperado) => {
            expect(diaISO(new Date(instante))).toBe(esperado);
        });
    });

    describe("interpretarDia", () => {
        it("lê a data como meia-noite local, não como meia-noite UTC", () => {
            const instante = interpretarDia("2026-08-19");

            expect(instante?.toISOString()).toBe("2026-08-19T03:00:00.000Z");
        });

        it("volta para o mesmo dia ao passar por diaISO", () => {
            expect(diaISO(interpretarDia("2026-08-19") as Date)).toBe("2026-08-19");
        });

        it.each(["19/08/2026", "2026-8-19", "ontem", "", "2026-13-45"])(
            "devolve null para %p, para a rota poder responder 400",
            (texto) => {
                expect(interpretarDia(texto)).toBeNull();
            },
        );
    });
});
