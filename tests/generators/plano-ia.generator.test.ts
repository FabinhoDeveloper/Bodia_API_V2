import EngineService from "../../src/services/engine.service";
import CatalogoFilter from "../../src/prompts/catalogo.filter";
import AiService from "../../src/services/ai.service";
import DietaIaGenerator from "../../src/generators/dieta-ia.generator";
import AjusteSelecao from "../../src/generators/ajuste-selecao";
import PlanoIaGenerator from "../../src/generators/plano-ia.generator";
import PorcoesSolver from "../../src/generators/porcoes.solver";
import TreinoIaGenerator from "../../src/generators/treino-ia.generator";
import ValidadorMacros from "../../src/generators/validador-macros";
import ValidadorVolume from "../../src/generators/validador-volume";
import DietaSelecaoPrompt from "../../src/prompts/dieta-selecao.prompt";
import TreinoPrompt from "../../src/prompts/treino.prompt";
import { PerfilInput, PerfilParaPlano } from "../../src/types/perfil.types";

const PERFIL: PerfilInput = {
    sexo: "F",
    dataNascimento: "1998-04-10",
    peso: 65,
    altura: 165,
    percentualGordura: 20,
    nivelAtividade: "moderado",
    nivelExperiencia: "iniciante",
    objetivo: "perder",
    diasPorSemana: 4,
    numeroRefeicoes: 4,
};

const PERFIL_PLANO: PerfilParaPlano = { restricoesAlimentares: [], restricoesFisicas: [] };

// numeroRefeicoes: 4 -> estes são os nomes que o EngineService gera.
const REFEICOES = ["Café da manhã", "Almoço", "Lanche da tarde", "Jantar"];

// Arroz, tipo 1, cozido (id 3): 128.26 kcal, 2.52 prot, 28.06 carb, 0.23 gord /100g
// Frango, peito, sem pele, grelhado (id 410): 159.19 kcal, 32.03 prot, 0 carb, 2.48 gord /100g
const ARROZ = 3;
const FRANGO = 410;

function selecaoValida() {
    return {
        refeicoes: REFEICOES.map((nome) => ({ nome, alimentoIds: [ARROZ, FRANGO] })),
    };
}

function treinoValido() {
    return {
        sessoes: [
            {
                nome: "Upper",
                exercicios: [
                    { exercicioId: 1, nome: "Supino reto com barra", series: 4, repeticoes: "8-10" },
                ],
            },
        ],
        observacoes: "Beba água.",
    };
}

/**
 * Fake que responde por ETAPA, e não por ordem de chamada: dieta e treino rodam
 * em Promise.all, então a ordem em que chegam não é determinística.
 */
function aiServiceFake(respostas: Partial<Record<string, unknown | string>>) {
    const gerarJson = jest.fn(async (_system: string, _user: string, etapa: string) => {
        const resposta = respostas[etapa];

        if (resposta === undefined) throw new Error(`etapa inesperada no teste: ${etapa}`);
        return typeof resposta === "string" ? resposta : JSON.stringify(resposta);
    });

    return { gerarJson } as unknown as AiService & { gerarJson: jest.Mock };
}

/**
 * Validadores que aprovam ou reprovam sob comando.
 *
 * Fazer o plano REALMENTE fechar as metas num teste exigiria montar uma seleção
 * que o solver consiga encaixar nos quatro alvos — o que testaria o solver, não
 * o laço de retry. Aqui o que importa é o gerador reagir ao veredito.
 */
function validadorMacrosFake(dentroDoLimite: boolean) {
    const real = new ValidadorMacros();

    return {
        validar: (...args: Parameters<ValidadorMacros["validar"]>) => ({
            ...real.validar(...args),
            dentroDoLimite,
        }),
        validarRefeicao: real.validarRefeicao.bind(real),
    } as unknown as ValidadorMacros;
}

function validadorVolumeFake(dentroDoLimite: boolean) {
    const real = new ValidadorVolume();

    return {
        validar: (...args: Parameters<ValidadorVolume["validar"]>) => ({
            ...real.validar(...args),
            dentroDoLimite,
        }),
    } as unknown as ValidadorVolume;
}

function criarGerador(
    respostas: Partial<Record<string, unknown | string>>,
    veredito: { macros?: boolean; volume?: boolean } = {},
) {
    const aiService = aiServiceFake(respostas);

    const validadorMacros =
        veredito.macros === undefined
            ? new ValidadorMacros()
            : validadorMacrosFake(veredito.macros);
    const validadorVolume =
        veredito.volume === undefined
            ? new ValidadorVolume()
            : validadorVolumeFake(veredito.volume);

    const planoIaGenerator = new PlanoIaGenerator(
        new CatalogoFilter(),
        new DietaIaGenerator(new DietaSelecaoPrompt(), aiService, new PorcoesSolver()),
        new TreinoIaGenerator(new TreinoPrompt(), aiService),
        validadorMacros,
        validadorVolume,
        new AjusteSelecao(new ValidadorMacros()),
    );

    return { planoIaGenerator, aiService };
}

/** Só as etapas, na ordem em que a IA foi chamada. */
function etapasDe(aiService: { gerarJson: jest.Mock }) {
    return aiService.gerarJson.mock.calls.map((c) => c[2] as string);
}

const RESPOSTAS_OK = {
    "dieta:seleção": selecaoValida(),
    treino: treinoValido(),
};

describe("PlanoIaGenerator", () => {
    const resultado = new EngineService().calcular(PERFIL);

    // DUAS chamadas, não três: as gramas deixaram de ser pedidas ao modelo e
    // passaram a ser resolvidas pelo PorcoesSolver.
    it("monta o plano a partir das duas chamadas", async () => {
        const { planoIaGenerator, aiService } = criarGerador(RESPOSTAS_OK, {
            macros: true,
            volume: true,
        });

        const { plano } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        expect(aiService.gerarJson).toHaveBeenCalledTimes(2);
        expect(etapasDe(aiService)).toEqual(expect.arrayContaining(["dieta:seleção", "treino"]));
        expect(plano.dieta.refeicoes).toHaveLength(4);
        expect(plano.treino.sessoes[0].nome).toBe("Upper");
        expect(plano.observacoes).toBe("Beba água.");
    });

    it("recalcula os macros a partir da TACO, e não da palavra do modelo", async () => {
        const { planoIaGenerator } = criarGerador(RESPOSTAS_OK);

        const { plano, validacao } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        const somaKcal = plano.dieta.refeicoes
            .flatMap((r) => r.itens ?? [])
            .reduce((total, item) => {
                const alimento = item.alimentoId === ARROZ ? 128.26 : 159.19;
                return total + (alimento * item.gramas) / 100;
            }, 0);

        expect(validacao.calorias.obtido).toBeCloseTo(somaKcal, 0);
        expect(validacao.calorias.meta).toBe(resultado.meta.caloriasAlvo);
    });

    // O nome nunca vem do modelo — e agora nem chega a existir uma resposta dele
    // sobre as porções de onde um nome errado pudesse vir.
    it("usa o nome do catálogo", async () => {
        const { planoIaGenerator } = criarGerador(RESPOSTAS_OK);

        const { plano } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

        expect(plano.dieta.refeicoes[0].itens[0].nome).toBe("Arroz, tipo 1, cozido");
    });

    describe("chamada 1 — seleção", () => {
        it("rejeita alimento que não existe no catálogo (alucinação de id)", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[0].alimentoIds = [999999];

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /alimento fora do catálogo permitido/,
            );
        });

        // O catálogo filtrado é a fronteira de segurança: um alimento proibido
        // não pode entrar nem que o modelo cite o id correto dele.
        it("rejeita alimento proibido pela restrição, mesmo com id real", async () => {
            const { planoIaGenerator } = criarGerador(RESPOSTAS_OK);

            await expect(
                planoIaGenerator.gerar(
                    { restricoesAlimentares: ["Vegano"], restricoesFisicas: [] },
                    resultado,
                ),
            ).rejects.toThrow(/alimento fora do catálogo permitido/);
        });

        it("rejeita seleção com refeição faltando", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes = selecao.refeicoes.slice(1);

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /não escolheu alimentos para a refeição "Café da manhã"/,
            );
        });

        it("rejeita refeição sem alimento nenhum", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [];

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /não escolheu alimentos para a refeição "Almoço"/,
            );
        });

        it("falha com mensagem própria quando a seleção não é json", async () => {
            const { planoIaGenerator } = criarGerador({
                ...RESPOSTAS_OK,
                "dieta:seleção": "isto não é json",
            });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                "A IA retornou um JSON inválido na seleção de alimentos",
            );
        });

        // Sem base de carboidrato ou sem proteína, a meta de um almoço é
        // inalcançável por construção e o solver entregaria o prato possível com
        // um desvio enorme. Falhar é mais honesto: o problema é da SELEÇÃO.
        it("rejeita almoço sem base de carboidrato", async () => {
            const selecao = selecaoValida();
            // 100 = Brócolis, cozido — vegetal, não é base.
            selecao.refeicoes[1].alimentoIds = [FRANGO, 100];

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /montou "Almoço" sem nenhuma base de carboidrato/,
            );
        });

        it("rejeita almoço sem fonte de proteína", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [ARROZ, 100];

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /montou "Almoço" sem nenhuma fonte de proteína/,
            );
        });

        // A conferência é só das refeições principais: num lanche a meta é
        // pequena e uma fruta com iogurte a resolve.
        it("aceita lanche sem base de carboidrato", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[2].alimentoIds = [FRANGO, 100];

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, "dieta:seleção": selecao });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).resolves.toBeDefined();
        });
    });

    describe("etapa 2 — porções", () => {
        // A etapa deixou de ser uma chamada à IA. Os modos de falha que existiam
        // aqui — id fora da seleção, gramas zeradas ou negativas, refeição sem
        // quantidades — não têm mais como acontecer: o solver só devolve os ids
        // que recebeu e sempre dentro das faixas de data/porcoes.ts.
        it("resolve as gramas sem chamar a IA", async () => {
            const { planoIaGenerator, aiService } = criarGerador(RESPOSTAS_OK);

            const { plano } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

            expect(aiService.gerarJson.mock.calls.map((c) => c[2])).not.toContain(
                "dieta:quantidades",
            );
            for (const refeicao of plano.dieta.refeicoes) {
                expect(refeicao.itens).toHaveLength(2);
                for (const item of refeicao.itens ?? []) {
                    expect(item.gramas).toBeGreaterThan(0);
                }
            }
        });

        // O sintoma que originou este trabalho: um almoço com 400 g de arroz. O
        // teto de data/porcoes.ts para arroz cozido é 250 g.
        it("mantém toda porção dentro da faixa do comível", async () => {
            const { planoIaGenerator } = criarGerador(RESPOSTAS_OK);

            const { plano } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

            const arroz = plano.dieta.refeicoes
                .flatMap((r) => r.itens ?? [])
                .filter((item) => item.alimentoId === ARROZ);

            expect(arroz.length).toBeGreaterThan(0);
            for (const item of arroz) {
                expect(item.gramas).toBeGreaterThanOrEqual(80);
                expect(item.gramas).toBeLessThanOrEqual(250);
            }
        });

        it("é determinístico: a mesma seleção devolve as mesmas gramas", async () => {
            const primeira = await criarGerador(RESPOSTAS_OK).planoIaGenerator.gerar(
                PERFIL_PLANO,
                resultado,
            );
            const segunda = await criarGerador(RESPOSTAS_OK).planoIaGenerator.gerar(
                PERFIL_PLANO,
                resultado,
            );

            expect(primeira.plano.dieta.refeicoes).toEqual(segunda.plano.dieta.refeicoes);
        });
    });

    /**
     * O laço de retry. Até então o desvio era medido, reportado e ignorado: o
     * plano ia para o banco fora da tolerância.
     */
    describe("retry quando os validadores acusam", () => {
        it("não repete quando o plano fecha de primeira", async () => {
            const { planoIaGenerator, aiService } = criarGerador(RESPOSTAS_OK, {
                macros: true,
                volume: true,
            });

            const { tentativas } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

            expect(tentativas).toBe(1);
            expect(aiService.gerarJson).toHaveBeenCalledTimes(2);
        });

        // O teto existe porque nem todo desvio é culpa da seleção: se a meta da
        // refeição não couber em porções realistas, insistir só queima crédito.
        it("para no teto de tentativas quando nunca fecha", async () => {
            const { planoIaGenerator, aiService } = criarGerador(RESPOSTAS_OK, {
                macros: false,
                volume: false,
            });

            const { tentativas } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

            expect(tentativas).toBe(3);
            expect(etapasDe(aiService).filter((e) => e === "dieta:seleção")).toHaveLength(3);
            expect(etapasDe(aiService).filter((e) => e === "treino")).toHaveLength(3);
        });

        // Refazer as duas trilhas gastaria uma chamada à toa e ainda arriscaria
        // estragar a que já estava boa.
        it("refaz só o treino quando apenas o volume falha", async () => {
            const { planoIaGenerator, aiService } = criarGerador(RESPOSTAS_OK, {
                macros: true,
                volume: false,
            });

            await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

            expect(etapasDe(aiService).filter((e) => e === "dieta:seleção")).toHaveLength(1);
            expect(etapasDe(aiService).filter((e) => e === "treino")).toHaveLength(3);
        });

        it("refaz só a dieta quando apenas os macros falham", async () => {
            const { planoIaGenerator, aiService } = criarGerador(RESPOSTAS_OK, {
                macros: false,
                volume: true,
            });

            await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

            expect(etapasDe(aiService).filter((e) => e === "dieta:seleção")).toHaveLength(3);
            expect(etapasDe(aiService).filter((e) => e === "treino")).toHaveLength(1);
        });

        // Repetir o mesmo prompt daria a mesma resposta. O que muda a segunda
        // tentativa é o desvio medido voltando para dentro dela.
        it("realimenta o desvio no prompt da tentativa seguinte", async () => {
            const { planoIaGenerator, aiService } = criarGerador(RESPOSTAS_OK, {
                macros: false,
                volume: true,
            });

            await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

            const selecoes = aiService.gerarJson.mock.calls.filter((c) => c[2] === "dieta:seleção");

            expect(selecoes[0][1]).not.toContain("Tentativa anterior");
            expect(selecoes[1][1]).toContain("Tentativa anterior");
            expect(selecoes[1][1]).toContain("Almoço");
        });

        // Nunca deixa o usuário sem plano: o desvio residual segue na
        // conferência, que é o que o RF22 pede.
        it("devolve um plano mesmo esgotadas as tentativas", async () => {
            const { planoIaGenerator } = criarGerador(RESPOSTAS_OK, {
                macros: false,
                volume: false,
            });

            const { plano, validacao } = await planoIaGenerator.gerar(PERFIL_PLANO, resultado);

            expect(plano.dieta.refeicoes).toHaveLength(4);
            expect(validacao.dentroDoLimite).toBe(false);
        });

    });

    describe("chamada 3 — treino", () => {
        it("rejeita exercício que não existe no catálogo", async () => {
            const treino = treinoValido();
            treino.sessoes[0].exercicios[0].exercicioId = 999999;

            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, treino });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                /exercício fora do catálogo permitido/,
            );
        });

        it("rejeita treino sem sessões", async () => {
            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, treino: { sessoes: [] } });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                "A IA retornou um treino sem sessões",
            );
        });

        it("rejeita JSON malformado", async () => {
            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, treino: "nada de json" });

            await expect(planoIaGenerator.gerar(PERFIL_PLANO, resultado)).rejects.toThrow(
                "A IA retornou um JSON inválido no treino",
            );
        });
    });

    // Caminho exclusivo do endpoint temporário de benchmark. Roda as trilhas em
    // paralelo como gerar(), mas devolve tempo por etapa e nunca lança: uma
    // falha da IA vira `sucesso: false` no corpo, que é o que o benchmark quer
    // conseguir inspecionar.
    describe("gerarComMetricas", () => {
        it("mede as duas trilhas e devolve o plano validado", async () => {
            const { planoIaGenerator } = criarGerador(RESPOSTAS_OK);

            const metricas = await planoIaGenerator.gerarComMetricas(PERFIL_PLANO, resultado);

            expect(metricas.sucesso).toBe(true);
            expect(metricas.plano?.dieta.refeicoes).toHaveLength(4);
            expect(metricas.etapas.map((e) => e.nome)).toEqual(["dieta", "treino"]);
            expect(metricas.etapas.every((e) => e.sucesso)).toBe(true);
            expect(metricas.validacaoOk).toBe(metricas.validacao?.dentroDoLimite);
        });

        it("não lança quando a IA falha — devolve sucesso false com o erro", async () => {
            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, treino: "nada de json" });

            const metricas = await planoIaGenerator.gerarComMetricas(PERFIL_PLANO, resultado);

            expect(metricas.sucesso).toBe(false);
            expect(metricas.plano).toBeNull();
            expect(metricas.erro?.mensagem).toMatch("A IA retornou um JSON inválido no treino");
        });

        // A trilha que falha precisa aparecer marcada como falha, e a que passou
        // precisa continuar marcada como sucesso — antes o relatório chutava o
        // nome pela quantidade de etapas já registradas.
        it("marca só a trilha que falhou, mantendo a outra como sucesso", async () => {
            const { planoIaGenerator } = criarGerador({ ...RESPOSTAS_OK, treino: "nada de json" });

            const { etapas } = await planoIaGenerator.gerarComMetricas(PERFIL_PLANO, resultado);

            expect(etapas).toEqual([
                expect.objectContaining({ nome: "dieta", sucesso: true }),
                expect.objectContaining({ nome: "treino", sucesso: false }),
            ]);
        });

        // Com `Promise.all`, a rejeição da dieta retornaria antes de o treino
        // terminar — a etapa dele nunca entraria no relatório (e a rejeição dele
        // ficaria sem dono). O allSettled é o que garante as duas.
        it("executa e reporta o treino mesmo quando a dieta falha", async () => {
            const { planoIaGenerator, aiService } = criarGerador({
                ...RESPOSTAS_OK,
                "dieta:seleção": { refeicoes: [] },
            });

            const { etapas } = await planoIaGenerator.gerarComMetricas(PERFIL_PLANO, resultado);

            expect(aiService.gerarJson).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                "treino",
            );
            expect(etapas).toEqual([
                expect.objectContaining({ nome: "dieta", sucesso: false }),
                expect.objectContaining({ nome: "treino", sucesso: true }),
            ]);
        });

        // As trilhas se sobrepõem no relógio, então o total é o max e não a
        // soma. É esse total que decide se o modelo cabe nos 210s do app — se
        // ele voltar a ser a soma, o benchmark passa a reprovar modelo que cabe.
        it("reporta o wall clock das trilhas, não a soma delas", async () => {
            const { planoIaGenerator } = criarGerador(RESPOSTAS_OK);

            const { llmMs, etapas } = await planoIaGenerator.gerarComMetricas(
                PERFIL_PLANO,
                resultado,
            );

            const soma = etapas.reduce((total, etapa) => total + etapa.ms, 0);

            expect(llmMs).toBeGreaterThanOrEqual(Math.max(...etapas.map((e) => e.ms)));
            expect(llmMs).toBeLessThan(soma);
        });
    });
});
