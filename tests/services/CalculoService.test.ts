import CalculoService from "../../src/services/CalculoService";
import {
    NivelAtividade,
    NivelExperiencia,
    Objetivo,
    PerfilInput,
} from "../../src/types/perfil.types";

function dataNascimentoParaIdade(idade: number): string {
    const hoje = new Date();
    const nascimento = new Date(hoje.getFullYear() - idade, hoje.getMonth(), hoje.getDate());
    return nascimento.toISOString().slice(0, 10);
}

function perfilBase(overrides: Partial<PerfilInput> = {}): PerfilInput {
    return {
        sexo: "M",
        dataNascimento: dataNascimentoParaIdade(30),
        peso: 80,
        altura: 180,
        percentualGordura: null,
        nivelAtividade: "sedentario",
        nivelExperiencia: "iniciante",
        objetivo: "perder",
        diasPorSemana: 3,
        ...overrides,
    };
}

describe("CalculoService", () => {
    const calculoService = new CalculoService();

    describe("calcular - homem, déficit, sedentário", () => {
        const resultado = calculoService.calcular(perfilBase());

        it("calcula metabolismo (idade, IMC, TMB, TDEE) pela equação de Mifflin-St Jeor", () => {
            expect(resultado.metabolismo.idade).toBe(30);
            expect(resultado.metabolismo.imc).toBeCloseTo(24.7, 5);
            expect(resultado.metabolismo.tmb).toBe(1780);
            expect(resultado.metabolismo.fatorAtividade).toBe(1.2);
            expect(resultado.metabolismo.tdee).toBe(2136);
        });

        it("aplica o déficit calórico do objetivo sobre o TDEE", () => {
            expect(resultado.meta.ajustePercentual).toBe(-0.2);
            expect(resultado.meta.caloriasAlvo).toBe(1709);
        });

        it("distribui os macros usando o peso total (sem percentual de gordura informado)", () => {
            expect(resultado.macros.proteina).toEqual({ g: 216, kcal: 864 });
            expect(resultado.macros.gordura).toEqual({ g: 47, kcal: 427 });
            expect(resultado.macros.carboidrato).toEqual({ g: 105, kcal: 418 });
        });

        it("monta o split de treino e o volume por nível de experiência", () => {
            expect(resultado.treino).toEqual({
                diasPorSemana: 3,
                split: "Push / Pull / Legs",
                sessoes: [
                    { nome: "Push", frequenciaSemanal: 1 },
                    { nome: "Pull", frequenciaSemanal: 1 },
                    { nome: "Legs", frequenciaSemanal: 1 },
                ],
                seriesPorGrupoSemana: 10,
            });
        });
    });

    describe("calcular - mulher, manutenção, moderada, com percentual de gordura", () => {
        const resultado = calculoService.calcular(
            perfilBase({
                sexo: "F",
                dataNascimento: dataNascimentoParaIdade(25),
                peso: 65,
                altura: 165,
                percentualGordura: 20,
                nivelAtividade: "moderado",
                nivelExperiencia: "avancado",
                objetivo: "manter",
                diasPorSemana: 4,
            }),
        );

        it("calcula metabolismo pela equação feminina de Mifflin-St Jeor", () => {
            expect(resultado.metabolismo.idade).toBe(25);
            expect(resultado.metabolismo.imc).toBeCloseTo(23.9, 5);
            expect(resultado.metabolismo.tmb).toBe(1395);
            expect(resultado.metabolismo.tdee).toBe(2162);
        });

        it("mantém a meta calórica igual ao TDEE (sem ajuste)", () => {
            expect(resultado.meta.ajustePercentual).toBe(0);
            expect(resultado.meta.caloriasAlvo).toBe(2162);
        });

        it("usa a massa magra (peso × (1 - %gordura)) como referência de proteína", () => {
            expect(resultado.macros.proteina).toEqual({ g: 88, kcal: 352 });
            expect(resultado.macros.gordura).toEqual({ g: 60, kcal: 541 });
            expect(resultado.macros.carboidrato).toEqual({ g: 317, kcal: 1269 });
        });

        it("monta o split Upper/Lower para 4 dias", () => {
            expect(resultado.treino.split).toBe("Upper / Lower");
            expect(resultado.treino.sessoes).toEqual([
                { nome: "Upper", frequenciaSemanal: 2 },
                { nome: "Lower", frequenciaSemanal: 2 },
            ]);
            expect(resultado.treino.seriesPorGrupoSemana).toBe(18);
        });
    });

    it("os macros sempre somam exatamente a meta calórica (carboidrato é a variável de ajuste)", () => {
        const resultado = calculoService.calcular(perfilBase({ objetivo: "ganhar" }));
        const somaKcal =
            resultado.macros.proteina.kcal + resultado.macros.gordura.kcal + resultado.macros.carboidrato.kcal;

        expect(somaKcal).toBe(resultado.meta.caloriasAlvo);
    });

    it.each([
        ["sedentario", 2136],
        ["leve", 2448],
        ["moderado", 2759],
        ["intenso", 3071],
        ["atleta", 3382],
    ] satisfies [NivelAtividade, number][])("aplica o fator de atividade '%s' sobre a TMB", (nivelAtividade, tdeeEsperado) => {
        const resultado = calculoService.calcular(perfilBase({ nivelAtividade, objetivo: "manter" }));
        expect(resultado.metabolismo.tdee).toBe(tdeeEsperado);
    });

    it.each([
        ["perder", 1709],
        ["manter", 2136],
        ["ganhar", 2403],
    ] satisfies [Objetivo, number][])("ajusta a meta calórica para o objetivo '%s'", (objetivo, caloriasEsperadas) => {
        const resultado = calculoService.calcular(perfilBase({ objetivo }));
        expect(resultado.meta.caloriasAlvo).toBe(caloriasEsperadas);
    });

    it.each([
        [2, "Full body", 1],
        [3, "Push / Pull / Legs", 3],
        [4, "Upper / Lower", 2],
        [5, "Upper/Lower + Push/Pull/Legs", 5],
        [6, "Push / Pull / Legs x2", 3],
    ] satisfies [number, string, number][])(
        "monta o split correto para %i dias por semana",
        (diasPorSemana, splitEsperado, quantidadeSessoes) => {
            const resultado = calculoService.calcular(perfilBase({ diasPorSemana }));
            expect(resultado.treino.split).toBe(splitEsperado);
            expect(resultado.treino.sessoes).toHaveLength(quantidadeSessoes);
        },
    );

    it.each([
        ["iniciante", 10],
        ["intermediario", 14],
        ["avancado", 18],
    ] satisfies [NivelExperiencia, number][])(
        "nível '%s' usa %d séries/grupo/semana",
        (nivelExperiencia, seriesEsperadas) => {
            const resultado = calculoService.calcular(perfilBase({ nivelExperiencia }));
            expect(resultado.treino.seriesPorGrupoSemana).toBe(seriesEsperadas);
        },
    );

    // O modelo recebe a meta de cada refeição em vez do total do dia. Se as
    // partes não somarem o total, o plano fecha certo por refeição e errado no
    // dia — por isso a soma é verificada nos quatro cenários.
    describe("distribuição por refeição", () => {
        it.each([3, 4, 5, 6])("gera %i refeições com nomes distintos", (numeroRefeicoes) => {
            const { dieta } = calculoService.calcular(perfilBase({ numeroRefeicoes }));

            expect(dieta.numeroRefeicoes).toBe(numeroRefeicoes);
            expect(dieta.refeicoes).toHaveLength(numeroRefeicoes);
            expect(new Set(dieta.refeicoes.map((r) => r.nome)).size).toBe(numeroRefeicoes);
        });

        it.each([3, 4, 5, 6])(
            "a soma das %i refeições fecha exatamente a meta do dia",
            (numeroRefeicoes) => {
                const { dieta, meta, macros } = calculoService.calcular(
                    perfilBase({ numeroRefeicoes }),
                );
                const somar = (campo: "kcal" | "proteina" | "carboidrato" | "gordura") =>
                    dieta.refeicoes.reduce((total, r) => total + r[campo], 0);

                expect(somar("kcal")).toBe(meta.caloriasAlvo);
                expect(somar("proteina")).toBe(macros.proteina.g);
                expect(somar("carboidrato")).toBe(macros.carboidrato.g);
                expect(somar("gordura")).toBe(macros.gordura.g);
            },
        );

        it("concentra mais calorias no almoço que no café da manhã", () => {
            const { dieta } = calculoService.calcular(perfilBase({ numeroRefeicoes: 4 }));
            const almoco = dieta.refeicoes.find((r) => r.nome === "Almoço")!;
            const cafe = dieta.refeicoes.find((r) => r.nome === "Café da manhã")!;

            expect(almoco.kcal).toBeGreaterThan(cafe.kcal);
        });
    });

    describe("validarPerfil", () => {
        it("lança erro se diasPorSemana estiver fora de 2-6", () => {
            expect(() => calculoService.calcular(perfilBase({ diasPorSemana: 1 }))).toThrow(
                "diasPorSemana deve ser um inteiro entre 2 e 6",
            );
            expect(() => calculoService.calcular(perfilBase({ diasPorSemana: 7 }))).toThrow(
                "diasPorSemana deve ser um inteiro entre 2 e 6",
            );
        });

        it("lança erro se peso ou altura não forem positivos", () => {
            expect(() => calculoService.calcular(perfilBase({ peso: 0 }))).toThrow(
                "peso deve ser maior que zero",
            );
            expect(() => calculoService.calcular(perfilBase({ altura: -10 }))).toThrow(
                "altura deve ser maior que zero",
            );
        });
    });
});
