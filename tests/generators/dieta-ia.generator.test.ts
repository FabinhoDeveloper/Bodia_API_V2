import { ALIMENTOS } from "../../src/data/alimentos";
import DietaIaGenerator from "../../src/generators/dieta-ia.generator";
import PorcoesSolver from "../../src/generators/porcoes.solver";
import DietaSelecaoPrompt from "../../src/prompts/dieta-selecao.prompt";
import AiService from "../../src/services/ai.service";
import EngineService from "../../src/services/engine.service";
import { PerfilInput } from "../../src/types/perfil.types";

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

// numeroRefeicoes: 4 -> estes são os nomes que o EngineService gera.
const REFEICOES = ["Café da manhã", "Almoço", "Lanche da tarde", "Jantar"];

const ARROZ = 3; // Arroz, tipo 1, cozido — BASE_CARBO
const FRANGO = 410; // Frango, peito, sem pele, grelhado — PROTEINA
const BROCOLIS = 100; // Brócolis, cozido — VEGETAL

function selecaoValida() {
    return { refeicoes: REFEICOES.map((nome) => ({ nome, alimentoIds: [ARROZ, FRANGO] })) };
}

function umaRefeicao(nome: string, alimentoIds: number[]) {
    return { refeicoes: [{ nome, alimentoIds }] };
}

/**
 * Fake que responde por ETAPA. Aqui a etapa carrega o nome da refeição
 * ("dieta:reparo:Almoço"), então ela é também a asserção de QUAL refeição o
 * gerador pediu de novo.
 *
 * Uma etapa mapeada para uma função é chamada; é assim que se simula a falha da
 * chamada de reparo sem confundi-la com uma resposta inválida.
 */
function aiServiceFake(respostas: Record<string, unknown>) {
    const gerarJson = jest.fn(async (_system: string, _user: string, etapa: string) => {
        const resposta = respostas[etapa];

        if (resposta === undefined) throw new Error(`etapa inesperada no teste: ${etapa}`);
        if (typeof resposta === "function") return (resposta as () => Promise<string>)();

        return typeof resposta === "string" ? resposta : JSON.stringify(resposta);
    });

    return { gerarJson } as unknown as AiService & { gerarJson: jest.Mock };
}

function criarGerador(respostas: Record<string, unknown>) {
    const aiService = aiServiceFake(respostas);

    return {
        aiService,
        dietaGenerator: new DietaIaGenerator(
            new DietaSelecaoPrompt(),
            aiService,
            new PorcoesSolver(),
        ),
    };
}

/** Só as etapas, na ordem em que a IA foi chamada. */
function etapasDe(aiService: { gerarJson: jest.Mock }) {
    return aiService.gerarJson.mock.calls.map((c) => c[2] as string);
}

function idsDe(refeicoes: { nome: string; itens: { alimentoId: number }[] }[], nome: string) {
    return refeicoes.find((r) => r.nome === nome)!.itens.map((i) => i.alimentoId);
}

describe("DietaIaGenerator", () => {
    const resultado = new EngineService().calcular(PERFIL);

    const gerar = (respostas: Record<string, unknown>) => {
        const { dietaGenerator, aiService } = criarGerador(respostas);

        return dietaGenerator
            .gerar(resultado, ALIMENTOS, [])
            .then((dieta) => ({ ...dieta, aiService }));
    };

    it("não pede nada de novo quando a seleção passa", async () => {
        const { refeicoes, avisos, aiService } = await gerar({
            "dieta:seleção": selecaoValida(),
        });

        expect(aiService.gerarJson).toHaveBeenCalledTimes(1);
        expect(refeicoes).toHaveLength(4);
        expect(avisos).toEqual([]);
    });

    /**
     * O caso que originou o trabalho. Antes disto, `exigirCobertura` lançava e a
     * geração inteira morria num 500 — mesmo com o laço de retry do
     * PlanoIaGenerator de pé logo acima, e mesmo sendo o erro de UMA refeição
     * que o modelo conserta quando avisado.
     */
    describe("cobertura da refeição", () => {
        it("pede de novo SÓ a refeição sem fonte de proteína", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [ARROZ, BROCOLIS];

            const { refeicoes, avisos, aiService } = await gerar({
                "dieta:seleção": selecao,
                "dieta:reparo:Almoço": umaRefeicao("Almoço", [ARROZ, FRANGO]),
            });

            expect(etapasDe(aiService)).toEqual(["dieta:seleção", "dieta:reparo:Almoço"]);
            expect(idsDe(refeicoes, "Almoço")).toEqual([ARROZ, FRANGO]);
            expect(avisos).toEqual([]);
        });

        it("pede de novo a refeição sem base de carboidrato", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[3].alimentoIds = [FRANGO, BROCOLIS];

            const { refeicoes, avisos, aiService } = await gerar({
                "dieta:seleção": selecao,
                "dieta:reparo:Jantar": umaRefeicao("Jantar", [ARROZ, FRANGO]),
            });

            expect(etapasDe(aiService)).toContain("dieta:reparo:Jantar");
            expect(idsDe(refeicoes, "Jantar")).toContain(ARROZ);
            expect(avisos).toEqual([]);
        });

        // Só almoço e jantar são conferidos: num lanche a meta é pequena e uma
        // fruta com iogurte a resolve.
        it("não confere cobertura de lanche", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[2].alimentoIds = [BROCOLIS];

            const { avisos, aiService } = await gerar({ "dieta:seleção": selecao });

            expect(aiService.gerarJson).toHaveBeenCalledTimes(1);
            expect(avisos).toEqual([]);
        });

        // Duas refeições defeituosas custam UMA rodada, não duas: elas são
        // independentes e vão em Promise.all. É o que mantém o reparo dentro do
        // orçamento de tempo do RNF02.
        it("repara as refeições defeituosas em paralelo, na mesma rodada", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [ARROZ, BROCOLIS];
            selecao.refeicoes[3].alimentoIds = [ARROZ, BROCOLIS];

            const { avisos, aiService } = await gerar({
                "dieta:seleção": selecao,
                "dieta:reparo:Almoço": umaRefeicao("Almoço", [ARROZ, FRANGO]),
                "dieta:reparo:Jantar": umaRefeicao("Jantar", [ARROZ, FRANGO]),
            });

            expect(aiService.gerarJson).toHaveBeenCalledTimes(3);
            expect(avisos).toEqual([]);
        });
    });

    describe("refeição que a IA não devolveu", () => {
        it("monta do zero a refeição faltando", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes = selecao.refeicoes.slice(1);

            const { refeicoes, avisos, aiService } = await gerar({
                "dieta:seleção": selecao,
                "dieta:reparo:Café da manhã": umaRefeicao("Café da manhã", [ARROZ, FRANGO]),
            });

            expect(etapasDe(aiService)).toContain("dieta:reparo:Café da manhã");
            expect(refeicoes.map((r) => r.nome)).toEqual(REFEICOES);
            expect(idsDe(refeicoes, "Café da manhã")).toEqual([ARROZ, FRANGO]);
            expect(avisos).toEqual([]);
        });

        it("monta do zero a refeição sem alimento nenhum", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[2].alimentoIds = [];

            const { refeicoes, avisos } = await gerar({
                "dieta:seleção": selecao,
                "dieta:reparo:Lanche da tarde": umaRefeicao("Lanche da tarde", [ARROZ]),
            });

            expect(idsDe(refeicoes, "Lanche da tarde")).toEqual([ARROZ]);
            expect(avisos).toEqual([]);
        });
    });

    /**
     * O catálogo já passou pelo CatalogoFilter, então um id de fora dele é
     * alucinação E, potencialmente, um item proibido para este usuário entrando
     * pela porta dos fundos. Descartar mantém a barreira exatamente onde estava
     * — o que mudou é que a refeição vira pedido de reparo em vez de exceção.
     */
    describe("id fora do catálogo", () => {
        it("descarta o id inventado e mantém o resto da refeição", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[0].alimentoIds = [999999, ARROZ, FRANGO];

            const { refeicoes, avisos, aiService } = await gerar({
                "dieta:seleção": selecao,
            });

            expect(aiService.gerarJson).toHaveBeenCalledTimes(1);
            expect(idsDe(refeicoes, "Café da manhã")).toEqual([ARROZ, FRANGO]);
            expect(avisos).toEqual([]);
        });

        it("pede a refeição de novo quando o descarte quebra a cobertura", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [ARROZ, 999999];

            const { refeicoes, aiService } = await gerar({
                "dieta:seleção": selecao,
                "dieta:reparo:Almoço": umaRefeicao("Almoço", [ARROZ, FRANGO]),
            });

            expect(etapasDe(aiService)).toContain("dieta:reparo:Almoço");
            expect(idsDe(refeicoes, "Almoço")).toEqual([ARROZ, FRANGO]);
        });

        it("nunca deixa passar o id inventado, mesmo no reparo", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [ARROZ, BROCOLIS];

            const { refeicoes } = await gerar({
                "dieta:seleção": selecao,
                "dieta:reparo:Almoço": umaRefeicao("Almoço", [ARROZ, FRANGO, 999999]),
            });

            expect(idsDe(refeicoes, "Almoço")).toEqual([ARROZ, FRANGO]);
        });
    });

    describe("quando o reparo não resolve", () => {
        // Prato comestível com desvio honesto vale mais que usuário sem plano —
        // a mesma política do PorcoesSolver para meta inalcançável. O problema
        // viaja junto, em `avisos`, e o desvio que ele causa ainda passa pelo
        // ValidadorMacros lá em cima.
        it("entrega a dieta com aviso depois de esgotar os reparos", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [ARROZ, BROCOLIS];

            const { refeicoes, avisos, aiService } = await gerar({
                "dieta:seleção": selecao,
                // Insiste no mesmo erro.
                "dieta:reparo:Almoço": umaRefeicao("Almoço", [ARROZ, BROCOLIS]),
            });

            expect(etapasDe(aiService).filter((e) => e === "dieta:reparo:Almoço")).toHaveLength(2);
            expect(refeicoes).toHaveLength(4);
            expect(avisos).toEqual(["Almoço: sem nenhuma fonte de proteína"]);
        });

        // Um timeout no reparo não pode custar mais caro que o defeito que ele
        // tentava consertar: quem já tinha um prato imperfeito não pode acabar
        // sem prato nenhum.
        it("mantém a seleção original quando a chamada de reparo falha", async () => {
            const selecao = selecaoValida();
            selecao.refeicoes[1].alimentoIds = [ARROZ, BROCOLIS];

            const { refeicoes, avisos } = await gerar({
                "dieta:seleção": selecao,
                "dieta:reparo:Almoço": () => Promise.reject(new Error("timeout do modelo")),
            });

            expect(idsDe(refeicoes, "Almoço")).toEqual([ARROZ, BROCOLIS]);
            expect(avisos).toEqual(["Almoço: sem nenhuma fonte de proteína"]);
        });
    });

    /**
     * JSON quebrado continua sendo exceção, ao contrário das conferências por
     * refeição: não diz qual refeição consertar, e não há pedido estreito a
     * fazer. Quem trata é o laço de tentativas do PlanoIaGenerator.
     */
    describe("resposta imprestável", () => {
        it("lança quando a seleção não é json", async () => {
            await expect(gerar({ "dieta:seleção": "isto não é json" })).rejects.toThrow(
                "A IA retornou um JSON inválido na seleção de alimentos",
            );
        });

        it("lança quando a seleção vem sem refeições", async () => {
            await expect(gerar({ "dieta:seleção": { refeicoes: [] } })).rejects.toThrow(
                "A IA retornou uma seleção sem refeições",
            );
        });
    });

    /**
     * O reajuste por MACROS: a refeição está montável, mas não fechou a meta.
     * Vai só a refeição apontada, com o prato anterior junto.
     */
    describe("reajustar", () => {
        const AZEITE = 260;

        async function dietaInicial() {
            const { dietaGenerator } = criarGerador({ "dieta:seleção": selecaoValida() });
            return dietaGenerator.gerar(resultado, ALIMENTOS, []);
        }

        it("pede só as refeições corrigidas e devolve só elas, já com gramas", async () => {
            const atuais = (await dietaInicial()).refeicoes;
            const { dietaGenerator, aiService } = criarGerador({
                "dieta:reajuste:Almoço": umaRefeicao("Almoço", [ARROZ, FRANGO, AZEITE]),
            });

            const novas = await dietaGenerator.reajustar(resultado, ALIMENTOS, [], atuais, [
                { refeicao: "Almoço", instrucao: "Inclua uma fonte de gordura." },
            ]);

            expect(etapasDe(aiService)).toEqual(["dieta:reajuste:Almoço"]);
            expect(novas.map((r) => r.nome)).toEqual(["Almoço"]);
            expect(idsDe(novas, "Almoço")).toEqual([ARROZ, FRANGO, AZEITE]);
            expect(novas[0].itens.every((i) => i.gramas > 0)).toBe(true);
        });

        it("manda ao modelo o prato que ele vai corrigir", async () => {
            const atuais = (await dietaInicial()).refeicoes;
            const { dietaGenerator, aiService } = criarGerador({
                "dieta:reajuste:Jantar": umaRefeicao("Jantar", [ARROZ, FRANGO, AZEITE]),
            });

            await dietaGenerator.reajustar(resultado, ALIMENTOS, [], atuais, [
                { refeicao: "Jantar", instrucao: "Inclua uma fonte de gordura." },
            ]);

            const user = aiService.gerarJson.mock.calls[0][1] as string;

            expect(user).toContain('# Como "Jantar" está hoje');
            expect(user).toContain(`${ARROZ}|`);
            expect(user).toContain(`${FRANGO}|`);
            expect(user).toContain("Inclua uma fonte de gordura.");
        });

        // Trocar um prato com desvio por um impossível seria piorar em nome de
        // corrigir.
        it("descarta o reajuste que deixa o almoço sem base de carboidrato", async () => {
            const atuais = (await dietaInicial()).refeicoes;
            const { dietaGenerator } = criarGerador({
                "dieta:reajuste:Almoço": umaRefeicao("Almoço", [FRANGO, BROCOLIS]),
            });

            const novas = await dietaGenerator.reajustar(resultado, ALIMENTOS, [], atuais, [
                { refeicao: "Almoço", instrucao: "Troque um dos carboidratos." },
            ]);

            expect(novas).toEqual([]);
        });

        // Um timeout no reajuste não pode tirar do usuário a refeição que ele já
        // tinha — nem derrubar a volta inteira.
        it("engole a falha da chamada e segue com as outras refeições", async () => {
            const atuais = (await dietaInicial()).refeicoes;
            const { dietaGenerator } = criarGerador({
                "dieta:reajuste:Almoço": () => Promise.reject(new Error("timeout do modelo")),
                "dieta:reajuste:Jantar": umaRefeicao("Jantar", [ARROZ, FRANGO, AZEITE]),
            });

            const novas = await dietaGenerator.reajustar(resultado, ALIMENTOS, [], atuais, [
                { refeicao: "Almoço", instrucao: "Inclua uma fonte de gordura." },
                { refeicao: "Jantar", instrucao: "Inclua uma fonte de gordura." },
            ]);

            expect(novas.map((r) => r.nome)).toEqual(["Jantar"]);
        });
    });
});
