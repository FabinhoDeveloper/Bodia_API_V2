import { ALIMENTOS } from "../../src/data/alimentos";
import AjusteSelecao from "../../src/generators/ajuste-selecao";
import ValidadorMacros from "../../src/generators/validador-macros";
import EngineService from "../../src/services/engine.service";
import { PerfilInput } from "../../src/types/perfil.types";
import { PlanoGerado } from "../../src/types/plano.types";

const PERFIL: PerfilInput = {
    sexo: "M",
    dataNascimento: "2000-01-01",
    peso: 85,
    altura: 179,
    percentualGordura: null,
    nivelAtividade: "moderado",
    nivelExperiencia: "iniciante",
    objetivo: "manter",
    diasPorSemana: 4,
    numeroRefeicoes: 4,
};

const ARROZ = 3;
const FRANGO = 410;
const ALFACE = 91;
const AZEITE = 260;

function plano(itensDoAlmoco: { alimentoId: number; nome: string; gramas: number }[]): PlanoGerado {
    return {
        dieta: {
            refeicoes: [
                { nome: "Café da manhã", itens: [] },
                { nome: "Almoço", itens: itensDoAlmoco },
                { nome: "Lanche da tarde", itens: [] },
                { nome: "Jantar", itens: [] },
            ],
        },
        treino: { sessoes: [] },
    };
}

describe("AjusteSelecao", () => {
    const resultado = new EngineService().calcular(PERFIL);
    const ajusteSelecao = new AjusteSelecao(new ValidadorMacros());

    const doAlmoco = (correcoes: { refeicao: string; instrucao: string }[]) =>
        correcoes.find((c) => c.refeicao === "Almoço");

    // A instrução tem de falar de COMIDA. "O almoço ficou 18% abaixo no
    // carboidrato" não diz ao modelo o que fazer; trocar um alimento, sim.
    it("pede carboidrato denso quando o carboidrato falta", () => {
        // Proteína e gordura cobertas, nenhuma base de carboidrato: sobra o
        // carboidrato como o desvio dominante, isolado.
        const correcoes = ajusteSelecao.montar(
            plano([
                { alimentoId: FRANGO, nome: "Frango", gramas: 200 },
                { alimentoId: AZEITE, nome: "Azeite", gramas: 25 },
            ]),
            ALIMENTOS,
            resultado,
        );

        expect(doAlmoco(correcoes)!.instrucao).toMatch(/carboidrato mais denso/);
    });

    it("pede fonte de gordura quando a gordura é o que mais falta", () => {
        // Arroz sozinho, em porção que cobre boa parte do carboidrato: sobra a
        // gordura como o desvio dominante.
        const correcoes = ajusteSelecao.montar(
            plano([{ alimentoId: ARROZ, nome: "Arroz", gramas: 400 }]),
            ALIMENTOS,
            resultado,
        );

        expect(doAlmoco(correcoes)!.instrucao).toMatch(/gordura/);
    });

    it("manda remover quando o macro SOBRA, e não faltar", () => {
        const correcoes = ajusteSelecao.montar(
            plano([{ alimentoId: AZEITE, nome: "Azeite", gramas: 200 }]),
            ALIMENTOS,
            resultado,
        );

        expect(doAlmoco(correcoes)!.instrucao).toMatch(/Remova|Troque|mais leves/);
    });

    // Mandar corrigir os quatro macros de uma vez dá instruções que se
    // contradizem, e o modelo escolhe qual seguir.
    it("dá uma instrução por refeição, não uma por macro", () => {
        // Um prato de alface erra os quatro macros de uma vez.
        const correcoes = ajusteSelecao.montar(
            plano([{ alimentoId: ALFACE, nome: "Alface", gramas: 100 }]),
            ALIMENTOS,
            resultado,
        );

        expect(correcoes.filter((c) => c.refeicao === "Almoço")).toHaveLength(1);
    });

    it("não devolve correção para refeição sem meta correspondente", () => {
        const semMeta: PlanoGerado = {
            dieta: { refeicoes: [{ nome: "Brunch", itens: [] }] },
            treino: { sessoes: [] },
        };

        expect(ajusteSelecao.montar(semMeta, ALIMENTOS, resultado)).toEqual([]);
    });

    it("formata cada correção como uma linha de lista", () => {
        const texto = ajusteSelecao.comoTexto([
            { refeicao: "Almoço", instrucao: "Inclua um carboidrato mais denso." },
        ]);

        expect(texto).toEqual(["- Almoço: Inclua um carboidrato mais denso."]);
    });
});
