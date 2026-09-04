import ValidationError from "../../src/errors/validation.error";
import CatalogoFilter from "../../src/prompts/catalogo.filter";
import EngineService from "../../src/services/engine.service";
import { PerfilInput } from "../../src/types/perfil.types";

const PERFIL_IN: PerfilInput = {
    sexo: "F",
    dataNascimento: "1998-04-10",
    peso: 57,
    altura: 165,
    percentualGordura: 25,
    nivelAtividade: "moderado",
    nivelExperiencia: "iniciante",
    objetivo: "perder",
    diasPorSemana: 4,
    numeroRefeicoes: 4,
};

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

        /**
         * O recorte por nível. A regressão: uma INICIANTE recebia agachamento
         * livre com barra e supino com barra, porque `nivelExperiencia` não
         * chegava até aqui — era lido só pelo EngineService, para escolher o
         * número de séries, e sumia.
         */
        describe("recorte por nível de experiência", () => {
            it("não manda barra em grupo grande para iniciante", () => {
                const exercicios = catalogoFilter.filtrarExercicios([], ["Legs"], "iniciante");

                expect(contem(exercicios, "Agachamento livre com barra")).toBe(false);
                expect(contem(exercicios, "Stiff com barra")).toBe(false);
                expect(contem(exercicios, "Cadeira extensora")).toBe(true);
                expect(contem(exercicios, "Leg press 45 graus")).toBe(true);
            });

            // O corte é por COMPLEXIDADE, não por "peso livre": o ACSM
            // (Ratamess et al., 2009) recomenda incluir peso livre E máquina em
            // todos os níveis, e é isto que mantém a prescrição alinhada a ele.
            it("mantém peso livre simples no catálogo do iniciante", () => {
                const exercicios = catalogoFilter.filtrarExercicios([], ["Push", "Pull"], "iniciante");

                expect(contem(exercicios, "Supino reto com halteres")).toBe(true);
                expect(contem(exercicios, "Rosca direta com barra")).toBe(true);
            });

            it("libera tudo para intermediário e avançado", () => {
                for (const nivel of ["intermediario", "avancado"] as const) {
                    const exercicios = catalogoFilter.filtrarExercicios([], ["Legs"], nivel);

                    expect(contem(exercicios, "Agachamento livre com barra")).toBe(true);
                }
            });

            it("sem nível informado, não corta nada por dificuldade", () => {
                const exercicios = catalogoFilter.filtrarExercicios([], ["Legs"]);

                expect(contem(exercicios, "Agachamento livre com barra")).toBe(true);
            });

            it("dá ao iniciante um catálogo menor que o do avançado", () => {
                const iniciante = catalogoFilter.filtrarExercicios([], ["Upper"], "iniciante");
                const avancado = catalogoFilter.filtrarExercicios([], ["Upper"], "avancado");

                expect(iniciante.length).toBeLessThan(avancado.length);
                expect(iniciante.length).toBeGreaterThan(0);
            });

            /**
             * A válvula de folga. Um plano com um exercício acima do nível é
             * melhor que um 400 na cara de quem só queria treinar — mesmo
             * espírito do `orcarSessao`, que apara o orçamento até caber.
             *
             * O caso conhecido em que ela dispara sozinha: no split de 2 dias,
             * posterior de coxa só tem stiff com barra marcado para "Corpo
             * inteiro" (ver tests/data/dificuldade-treino.test.ts).
             */
            it("relaxa o teto no grupo que ficaria sem exercício", () => {
                const exercicios = catalogoFilter.filtrarExercicios(
                    [],
                    ["Corpo inteiro"],
                    "iniciante",
                );

                expect(contem(exercicios, "Stiff com barra")).toBe(true);
                // Relaxa SÓ aquele grupo: o quadríceps continua sem agachamento
                // livre, porque lá havia opção fácil de sobra.
                expect(contem(exercicios, "Agachamento livre com barra")).toBe(false);
            });

            it("todo grupo orçado sobrevive ao corte, em todo split", () => {
                const engine = new EngineService();

                for (const dias of [2, 3, 4, 5, 6]) {
                    const resultado = engine.calcular({ ...PERFIL_IN, diasPorSemana: dias });
                    const sessoes = resultado.treino.sessoes.map((sessao) => sessao.nome);
                    const exercicios = catalogoFilter.filtrarExercicios([], sessoes, "iniciante");

                    for (const sessao of resultado.treino.sessoes) {
                        for (const { grupo } of sessao.volume) {
                            const tem = exercicios.some((e) => e.grupoMuscular === grupo);
                            expect(`${dias}d ${sessao.nome}/${grupo}: ${tem}`).toBe(
                                `${dias}d ${sessao.nome}/${grupo}: true`,
                            );
                        }
                    }
                }
            });
        });
    });
});
