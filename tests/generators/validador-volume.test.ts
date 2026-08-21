import { EXERCICIOS } from "../../src/data/exercicios";
import ValidadorVolume from "../../src/generators/validador-volume";
import EngineService from "../../src/services/engine.service";
import { PerfilInput } from "../../src/types/perfil.types";
import { MAX_SERIES_POR_EXERCICIO } from "../../src/data/volume-treino";
import { PlanoGerado } from "../../src/types/plano.types";

const PERFIL: PerfilInput = {
    sexo: "M",
    dataNascimento: "1996-04-10",
    peso: 80,
    altura: 180,
    percentualGordura: null,
    nivelAtividade: "moderado",
    nivelExperiencia: "intermediario",
    objetivo: "manter",
    diasPorSemana: 4,
    numeroRefeicoes: 4,
};

const doGrupo = (grupo: string) => EXERCICIOS.filter((e) => e.grupoMuscular === grupo);

/** Um exercício por grupo, com as séries cruas — para testar valor fora da faixa. */
function planoBruto(series: Record<string, number>): PlanoGerado {
    const exercicios = Object.entries(series).map(([grupo, qtd]) => {
        const exercicio = doGrupo(grupo)[0];
        return { exercicioId: exercicio.id, nome: exercicio.nome, series: qtd, repeticoes: "8-12" };
    });

    return { dieta: { refeicoes: [] }, treino: { sessoes: [{ nome: "Upper", exercicios }] } };
}

/**
 * Reparte as séries de cada grupo entre exercícios distintos, respeitando o teto
 * por exercício — é o que a IA faz: "Peito 7" vira um de 4 e um de 3.
 */
function planoDistribuido(series: Record<string, number>): PlanoGerado {
    const exercicios = Object.entries(series).flatMap(([grupo, qtd]) => {
        const disponiveis = doGrupo(grupo);
        const quantos = Math.ceil(qtd / MAX_SERIES_POR_EXERCICIO);
        const base = Math.floor(qtd / quantos);
        const sobra = qtd - base * quantos;

        return Array.from({ length: quantos }, (_, i) => {
            const exercicio = disponiveis[i % disponiveis.length];
            return {
                exercicioId: exercicio.id,
                nome: exercicio.nome,
                series: base + (i < sobra ? 1 : 0),
                repeticoes: "8-12",
            };
        });
    });

    return { dieta: { refeicoes: [] }, treino: { sessoes: [{ nome: "Upper", exercicios }] } };
}

describe("ValidadorVolume", () => {
    const validador = new ValidadorVolume();
    const resultado = new EngineService().calcular(PERFIL);
    const upper = resultado.treino.sessoes.find((s) => s.nome === "Upper")!;

    /** O orçamento exato, montado com um exercício por grupo. */
    const exato = () =>
        Object.fromEntries(upper.volume.map((v) => [v.grupo, v.series])) as Record<string, number>;

    const validar = (series: Record<string, number>) =>
        validador.validar(planoDistribuido(series), EXERCICIOS, resultado).sessoes[0];

    it("mede o obtido a partir dos exercícios, não do que a IA afirmou", () => {
        const sessao = validar(exato());

        for (const grupo of sessao.grupos) {
            expect(grupo.obtido).toBe(grupo.prescrito);
            expect(grupo.desvioSeries).toBe(0);
        }
    });

    it("aponta o desvio quando um grupo recebe séries a mais", () => {
        const series = exato();
        const alvo = upper.volume[0].grupo;
        series[alvo] += 4;

        const sessao = validar(series);
        const desvio = sessao.grupos.find((g) => g.grupo === alvo)!;

        expect(desvio.desvioSeries).toBe(4);
        expect(sessao.dentroDoLimite).toBe(false);
    });

    it("aponta o grupo que ficou sem nenhuma série", () => {
        const series = exato();
        const ausente = upper.volume[0].grupo;
        delete series[ausente];

        const sessao = validar(series);
        const desvio = sessao.grupos.find((g) => g.grupo === ausente)!;

        expect(desvio.obtido).toBe(0);
        expect(desvio.desvioSeries).toBe(-desvio.prescrito);
        expect(sessao.dentroDoLimite).toBe(false);
    });

    // Cada grupo pode fechar certo e a sessão ainda inflar, se a IA acrescentar
    // um grupo que o orçamento não previu.
    it("acusa grupo treinado fora do orçamento", () => {
        const series = exato();
        series["Panturrilha"] = 3; // Lower, não Upper

        const sessao = validar(series);

        expect(sessao.gruposForaDoOrcamento).toContain("Panturrilha");
        expect(sessao.dentroDoLimite).toBe(false);
    });

    it("tolera uma série de diferença, que é arredondamento legítimo", () => {
        const series = exato();
        series[upper.volume[0].grupo] += 1;

        expect(validar(series).dentroDoLimite).toBe(true);
    });

    it.each([1, 9])("reprova exercício com %i séries, fora da faixa permitida", (qtd) => {
        const series = exato();
        series[upper.volume[0].grupo] = qtd;

        // Bruto de propósito: distribuir consertaria o valor antes de medir.
        const sessao = validador.validar(planoBruto(series), EXERCICIOS, resultado).sessoes[0];

        expect(sessao.dentroDoLimite).toBe(false);
    });

    it("reprova sessão com exercícios demais", () => {
        const series: Record<string, number> = {};
        // Um exercício por grupo do catálogo estoura o teto da sessão.
        for (const e of EXERCICIOS.slice(0, 40)) series[e.grupoMuscular] = 3;

        const sessao = validar(series);

        expect(sessao.dentroDoLimite).toBe(false);
    });

    it("resume o plano inteiro como fora do limite se uma sessão falhar", () => {
        const series = exato();
        series[upper.volume[0].grupo] += 5;

        const validacao = validador.validar(planoDistribuido(series), EXERCICIOS, resultado);

        expect(validacao.dentroDoLimite).toBe(false);
    });
});
