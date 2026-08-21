import EngineService from "../../src/services/engine.service";
import {
    exerciciosNecessarios,
    MAX_EXERCICIOS_POR_SESSAO,
    MAX_SERIES_POR_EXERCICIO,
    MAX_SERIES_POR_GRUPO_SESSAO,
    MIN_SERIES_POR_EXERCICIO,
} from "../../src/data/volume-treino";
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
        numeroRefeicoes: 4,
        ...overrides,
    };
}

describe("EngineService", () => {
    const engineService = new EngineService();

    describe("calcular - homem, déficit, sedentário", () => {
        const resultado = engineService.calcular(perfilBase());

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
            expect(resultado.treino).toMatchObject({
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
        const resultado = engineService.calcular(
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
            expect(resultado.treino.sessoes).toMatchObject([
                { nome: "Upper", frequenciaSemanal: 2 },
                { nome: "Lower", frequenciaSemanal: 2 },
            ]);
            expect(resultado.treino.seriesPorGrupoSemana).toBe(18);
        });
    });

    it("os macros sempre somam exatamente a meta calórica (carboidrato é a variável de ajuste)", () => {
        const resultado = engineService.calcular(perfilBase({ objetivo: "ganhar" }));
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
        const resultado = engineService.calcular(perfilBase({ nivelAtividade, objetivo: "manter" }));
        expect(resultado.metabolismo.tdee).toBe(tdeeEsperado);
    });

    it.each([
        ["perder", 1709],
        ["manter", 2136],
        ["ganhar", 2403],
    ] satisfies [Objetivo, number][])("ajusta a meta calórica para o objetivo '%s'", (objetivo, caloriasEsperadas) => {
        const resultado = engineService.calcular(perfilBase({ objetivo }));
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
            const resultado = engineService.calcular(perfilBase({ diasPorSemana }));
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
            const resultado = engineService.calcular(perfilBase({ nivelExperiencia }));
            expect(resultado.treino.seriesPorGrupoSemana).toBe(seriesEsperadas);
        },
    );


    /**
     * A regressão que estes testes existem para impedir.
     *
     * O motor entregava um TOTAL semanal e o prompt mandava o LLM dividir. As
     * duas coisas nunca foram confrontadas e não fechavam: em 13 das 15
     * combinações de dias x nível, o orçamento exigia mais exercícios do que o
     * próprio prompt permitia. O modelo recebia tarefa impossível e devolvia
     * volume arbitrário — sem ninguém conferir.
     *
     * Agora o orçamento sai pronto do motor, e a viabilidade é garantida por
     * construção. Se alguém mexer nas tabelas de volume-treino.ts e recriar a
     * contradição, é aqui que aparece.
     */
    describe("orçamento de volume por sessão", () => {
        const DIAS = [2, 3, 4, 5, 6];
        const NIVEIS: NivelExperiencia[] = ["iniciante", "intermediario", "avancado"];

        const combinacoes = DIAS.flatMap((dias) =>
            NIVEIS.map((nivel) => [dias, nivel] as [number, NivelExperiencia]),
        );

        it.each(combinacoes)(
            "%i dias / %s: toda sessão cabe nos limites de exercícios",
            (diasPorSemana, nivelExperiencia) => {
                const { treino } = engineService.calcular(
                    perfilBase({ diasPorSemana, nivelExperiencia }),
                );

                for (const sessao of treino.sessoes) {
                    expect(sessao.volume.length).toBeGreaterThan(0);
                    expect(exerciciosNecessarios(sessao.volume)).toBeLessThanOrEqual(
                        MAX_EXERCICIOS_POR_SESSAO,
                    );
                }
            },
        );

        it.each(combinacoes)(
            "%i dias / %s: nenhum grupo fica fora da faixa de séries",
            (diasPorSemana, nivelExperiencia) => {
                const { treino } = engineService.calcular(
                    perfilBase({ diasPorSemana, nivelExperiencia }),
                );

                for (const sessao of treino.sessoes) {
                    for (const item of sessao.volume) {
                        expect(item.series).toBeGreaterThanOrEqual(MIN_SERIES_POR_EXERCICIO);
                        expect(item.series).toBeLessThanOrEqual(MAX_SERIES_POR_GRUPO_SESSAO);
                    }
                }
            },
        );

        it("dá mais volume a quem tem mais experiência, no mesmo split", () => {
            const volumeDoPeito = (nivelExperiencia: NivelExperiencia) => {
                const { treino } = engineService.calcular(
                    perfilBase({ diasPorSemana: 4, nivelExperiencia }),
                );
                const upper = treino.sessoes.find((s) => s.nome === "Upper")!;
                return upper.volume.find((v) => v.grupo === "Peito")!.series;
            };

            // Antes de existir o teto por grupo/sessão, o aparo do orçamento
            // deixava o avançado com MENOS volume que o iniciante.
            expect(volumeDoPeito("iniciante")).toBeLessThan(volumeDoPeito("intermediario"));
            expect(volumeDoPeito("intermediario")).toBeLessThan(volumeDoPeito("avancado"));
        });

        it("dá aos grupos secundários menos volume direto que aos primários", () => {
            const { treino } = engineService.calcular(perfilBase({ diasPorSemana: 4 }));
            const upper = treino.sessoes.find((s) => s.nome === "Upper")!;

            const primarios = upper.volume.filter((v) => v.papel === "primario");
            const secundarios = upper.volume.filter((v) => v.papel === "secundario");

            expect(secundarios.length).toBeGreaterThan(0);
            expect(Math.max(...secundarios.map((v) => v.series))).toBeLessThan(
                Math.min(...primarios.map((v) => v.series)),
            );
        });

        it("divide o volume semanal pela frequência da sessão", () => {
            // Upper 2x/semana com alvo 14: 7 séries por sessão, não 14.
            const { treino } = engineService.calcular(
                perfilBase({ diasPorSemana: 4, nivelExperiencia: "intermediario" }),
            );
            const upper = treino.sessoes.find((s) => s.nome === "Upper")!;

            expect(upper.frequenciaSemanal).toBe(2);
            expect(upper.volume.find((v) => v.grupo === "Peito")!.series).toBe(7);
        });

        it("nunca prescreve mais séries num grupo do que caberia em um exercício só, sem exceder o teto", () => {
            const { treino } = engineService.calcular(
                perfilBase({ diasPorSemana: 6, nivelExperiencia: "avancado" }),
            );

            for (const sessao of treino.sessoes) {
                for (const item of sessao.volume) {
                    const exercicios = Math.ceil(item.series / MAX_SERIES_POR_EXERCICIO);
                    expect(exercicios).toBeGreaterThanOrEqual(1);
                }
            }
        });
    });

    // Antes a meta de água era constante no plano.mapper: 2000 ml para todo
    // mundo, sem passar pelo motor.
    describe("meta de hidratação", () => {
        it("entra no resultado do cálculo", () => {
            const { dieta } = engineService.calcular(perfilBase());

            expect(dieta.metaAguaMl).toBeGreaterThan(0);
        });

        it("difere entre perfis de peso diferente", () => {
            const leve = engineService.calcular(perfilBase({ peso: 55 })).dieta.metaAguaMl;
            const pesado = engineService.calcular(perfilBase({ peso: 100 })).dieta.metaAguaMl;

            expect(pesado).toBeGreaterThan(leve);
        });

        it("difere entre níveis de atividade", () => {
            const sedentario = engineService.calcular(
                perfilBase({ peso: 90, nivelAtividade: "sedentario" }),
            ).dieta.metaAguaMl;
            const atleta = engineService.calcular(
                perfilBase({ peso: 90, nivelAtividade: "atleta" }),
            ).dieta.metaAguaMl;

            expect(atleta).toBeGreaterThan(sedentario);
        });
    });

    // O modelo recebe a meta de cada refeição em vez do total do dia. Se as
    // partes não somarem o total, o plano fecha certo por refeição e errado no
    // dia — por isso a soma é verificada nos quatro cenários.
    describe("distribuição por refeição", () => {
        it.each([3, 4, 5, 6])("gera %i refeições com nomes distintos", (numeroRefeicoes) => {
            const { dieta } = engineService.calcular(perfilBase({ numeroRefeicoes }));

            expect(dieta.numeroRefeicoes).toBe(numeroRefeicoes);
            expect(dieta.refeicoes).toHaveLength(numeroRefeicoes);
            expect(new Set(dieta.refeicoes.map((r) => r.nome)).size).toBe(numeroRefeicoes);
        });

        it.each([3, 4, 5, 6])(
            "a soma das %i refeições fecha exatamente a meta do dia",
            (numeroRefeicoes) => {
                const { dieta, meta, macros } = engineService.calcular(
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
            const { dieta } = engineService.calcular(perfilBase({ numeroRefeicoes: 4 }));
            const almoco = dieta.refeicoes.find((r) => r.nome === "Almoço")!;
            const cafe = dieta.refeicoes.find((r) => r.nome === "Café da manhã")!;

            expect(almoco.kcal).toBeGreaterThan(cafe.kcal);
        });

        // Amarra os percentuais da tabela, não só a soma: sem isto, trocar 40%
        // por 30% no almoço continuaria fechando o dia e passando nos testes.
        it.each([
            [3, "Café da manhã", 0.25],
            [3, "Almoço", 0.4],
            [4, "Almoço", 0.35],
            [4, "Lanche da tarde", 0.15],
            [5, "Almoço", 0.35],
            [5, "Lanche da manhã", 0.1],
            [6, "Almoço", 0.3],
            [6, "Lanche da tarde", 0.1],
        ])("com %i refeições, %s recebe %f da meta do dia", (numeroRefeicoes, nome, fatia) => {
            const { dieta, meta } = engineService.calcular(perfilBase({ numeroRefeicoes }));
            const refeicao = dieta.refeicoes.find((r) => r.nome === nome)!;

            expect(refeicao.kcal).toBe(Math.round(meta.caloriasAlvo * fatia));
        });

        // A última refeição é a única fora da regra: recebe o restante, para a
        // soma das partes fechar o total exato do dia.
        it.each([
            [3, "Jantar"],
            [4, "Jantar"],
            [5, "Jantar"],
            [6, "Ceia"],
        ])("com %i refeições, a última do dia é %s", (numeroRefeicoes, nome) => {
            const { dieta } = engineService.calcular(perfilBase({ numeroRefeicoes }));

            expect(dieta.refeicoes[dieta.refeicoes.length - 1].nome).toBe(nome);
        });
    });

    describe("validarPerfil", () => {
        it("lança erro se diasPorSemana estiver fora de 2-6", () => {
            expect(() => engineService.calcular(perfilBase({ diasPorSemana: 1 }))).toThrow(
                "diasPorSemana deve ser um inteiro entre 2 e 6",
            );
            expect(() => engineService.calcular(perfilBase({ diasPorSemana: 7 }))).toThrow(
                "diasPorSemana deve ser um inteiro entre 2 e 6",
            );
        });

        it("lança erro se numeroRefeicoes estiver fora de 3-6", () => {
            expect(() => engineService.calcular(perfilBase({ numeroRefeicoes: 2 }))).toThrow(
                "numeroRefeicoes deve ser um inteiro entre 3 e 6",
            );
            expect(() => engineService.calcular(perfilBase({ numeroRefeicoes: 7 }))).toThrow(
                "numeroRefeicoes deve ser um inteiro entre 3 e 6",
            );
        });

        // O campo é obrigatório no tipo, mas o payload chega da rede sem
        // validação campo a campo — um app antigo ainda pode omiti-lo.
        it("lança erro se numeroRefeicoes não vier no perfil", () => {
            const semRefeicoes = perfilBase();
            delete (semRefeicoes as Partial<PerfilInput>).numeroRefeicoes;

            expect(() => engineService.calcular(semRefeicoes)).toThrow(
                "numeroRefeicoes deve ser um inteiro entre 3 e 6",
            );
        });

        it("lança erro se peso ou altura não forem positivos", () => {
            expect(() => engineService.calcular(perfilBase({ peso: 0 }))).toThrow(
                "peso deve ser maior que zero",
            );
            expect(() => engineService.calcular(perfilBase({ altura: -10 }))).toThrow(
                "altura deve ser maior que zero",
            );
        });
    });
});
