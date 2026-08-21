import {
    DESCANSO_MULTIARTICULAR_S,
    DESCANSO_UNIARTICULAR_S,
    descansoPara,
    ehMultiarticular,
} from "../../src/data/descanso-treino";
import { EXERCICIOS } from "../../src/data/exercicios";

const acharPorNome = (nome: string) => EXERCICIOS.find((e) => e.nome === nome)!;

describe("descanso-treino", () => {
    // A regressão que isto impede: descansoSegundos era 60 fixo no mapper, o
    // mesmo valor para o agachamento com barra e para a rosca concentrada.
    it.each([
        // "core exercises using heavier loads" — os exemplos da própria ACSM.
        ["Agachamento livre com barra", DESCANSO_MULTIARTICULAR_S],
        ["Supino reto com barra", DESCANSO_MULTIARTICULAR_S],
        ["Levantamento terra", DESCANSO_MULTIARTICULAR_S],
        ["Barra fixa pronada", DESCANSO_MULTIARTICULAR_S],
        // "assistance exercises"
        ["Crucifixo reto com halteres", DESCANSO_UNIARTICULAR_S],
        ["Voador (peck deck)", DESCANSO_UNIARTICULAR_S],
        ["Rosca concentrada", DESCANSO_UNIARTICULAR_S],
    ])("'%s' descansa %i segundos", (nome, esperado) => {
        expect(descansoPara(acharPorNome(nome))).toBe(esperado);
    });

    // A primeira tentativa classificava por articulacoes.length, campo que
    // lista articulações SOB RISCO DE LESÃO e não as do movimento. Estes três
    // saíam errados por causa disso.
    it.each([
        ["Tríceps testa com barra W", DESCANSO_UNIARTICULAR_S],
        ["Prancha isométrica", DESCANSO_UNIARTICULAR_S],
        ["Abdominal infra (elevação de pernas)", DESCANSO_UNIARTICULAR_S],
    ])("'%s' é acessório e descansa %i segundos", (nome, esperado) => {
        expect(descansoPara(acharPorNome(nome))).toBe(esperado);
    });

    it("dá mais descanso ao multiarticular que ao uniarticular", () => {
        expect(DESCANSO_MULTIARTICULAR_S).toBeGreaterThan(DESCANSO_UNIARTICULAR_S);
    });

    it("classifica pelo marcador de corpo inteiro, exceto abdômen", () => {
        const core = { sessoes: ["Push", "Upper", "Corpo inteiro"], grupoMuscular: "Peito" };
        const acessorio = { sessoes: ["Push", "Upper"], grupoMuscular: "Peito" };
        const abdomen = { sessoes: ["Corpo inteiro"], grupoMuscular: "Abdômen" };

        expect(ehMultiarticular(core as never)).toBe(true);
        expect(ehMultiarticular(acessorio as never)).toBe(false);
        // Abdominal aceita corpo inteiro por caber na sessão, não por ser
        // levantamento pesado. Prancha com 2 min de descanso seria absurdo.
        expect(ehMultiarticular(abdomen as never)).toBe(false);
    });

    it("nenhum exercício do catálogo fica fora das duas faixas", () => {
        const valores = new Set(EXERCICIOS.map(descansoPara));

        expect(valores).toEqual(new Set([DESCANSO_UNIARTICULAR_S, DESCANSO_MULTIARTICULAR_S]));
    });

    // Se o catálogo virar quase todo de um tipo só, a prescrição deixa de
    // distinguir nada e vale revisar a regra.
    it("o catálogo tem exercícios dos dois tipos em quantidade relevante", () => {
        const multi = EXERCICIOS.filter(ehMultiarticular).length;
        const uni = EXERCICIOS.length - multi;

        expect(multi).toBeGreaterThan(10);
        expect(uni).toBeGreaterThan(20);
    });

    // Nenhum exercício descansa MENOS do que os 60s que o mapper fixava antes:
    // a mudança é aditiva, ninguém perde descanso.
    it("nunca prescreve menos descanso do que o valor fixo anterior", () => {
        for (const exercicio of EXERCICIOS) {
            expect(descansoPara(exercicio)).toBeGreaterThanOrEqual(60);
        }
    });
});
