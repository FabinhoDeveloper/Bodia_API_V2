import { Alimento } from "../data/alimentos";
import { DESVIO_ACEITAVEL_PERCENTUAL } from "./validador-macros";
import ValidadorMacros from "./validador-macros";
import { ResultadoCalculo } from "../types/perfil.types";
import { PlanoGerado } from "../types/plano.types";

/** Um macro fora da tolerância, já traduzido no que o modelo deve fazer. */
interface Correcao {
    refeicao: string;
    instrucao: string;
}

/**
 * O que dizer ao modelo quando o plano não fechou, para a tentativa seguinte.
 *
 * Só existe porque as gramas são determinísticas: o `PorcoesSolver` já entrega o
 * melhor prato possível para os alimentos escolhidos, então o que sobrou de
 * desvio é responsabilidade da SELEÇÃO. Repetir o pedido de porções não teria o
 * que melhorar; trocar um alimento tem.
 *
 * A instrução fala de COMIDA, não de aritmética. "O Almoço ficou 18% abaixo no
 * carboidrato" não diz ao modelo o que fazer; "inclua um carboidrato mais denso,
 * como farofa, pão ou macarrão" diz. É a mesma razão pela qual o prompt de
 * seleção proíbe o modelo de calcular: pedir a ele a linguagem em que ele é bom.
 *
 * Vive em `generators/` e não em `prompts/` porque decide CONTEÚDO a partir de
 * uma medição. O prompt monta texto; quem sabe o que precisa ser dito é quem
 * mediu.
 */
export default class AjusteSelecao {
    private readonly validadorMacros;

    constructor(validadorMacros: ValidadorMacros) {
        this.validadorMacros = validadorMacros;
    }

    /**
     * As correções por refeição, ou lista vazia se estiver tudo dentro.
     *
     * Mede refeição a refeição, e não o dia: o total do dia diz que algo está
     * errado, não onde. O modelo monta uma refeição por vez.
     */
    montar(
        plano: PlanoGerado,
        alimentos: Alimento[],
        resultado: ResultadoCalculo,
    ): Correcao[] {
        const metaPorNome = new Map(resultado.dieta.refeicoes.map((r) => [r.nome, r]));
        const correcoes: Correcao[] = [];

        for (const refeicao of plano.dieta.refeicoes) {
            const meta = metaPorNome.get(refeicao.nome);
            if (!meta) continue;

            const validacao = this.validadorMacros.validarRefeicao(refeicao.itens ?? [], alimentos, {
                kcal: meta.kcal,
                proteina: meta.proteina,
                carboidrato: meta.carboidrato,
                gordura: meta.gordura,
            });

            if (validacao.dentroDoLimite) continue;

            const instrucao = this.instrucaoDe(validacao);
            if (instrucao) correcoes.push({ refeicao: refeicao.nome, instrucao });
        }

        return correcoes;
    }

    /** As correções já como as linhas que entram no prompt. */
    comoTexto(correcoes: Correcao[]): string[] {
        return correcoes.map((c) => `- ${c.refeicao}: ${c.instrucao}`);
    }

    /**
     * A instrução do macro MAIS fora da tolerância, e só dele.
     *
     * Mandar corrigir os quatro de uma vez dá instruções que se contradizem —
     * "mais carboidrato" e "menos caloria" na mesma frase —, e o modelo escolhe
     * qual seguir. Um alvo por refeição por tentativa é o que ele consegue
     * atender, e as tentativas seguintes cuidam do resto.
     */
    private instrucaoDe(validacao: {
        calorias: { desvioPercentual: number };
        proteina: { desvioPercentual: number };
        carboidrato: { desvioPercentual: number };
        gordura: { desvioPercentual: number };
    }): string | null {
        const candidatos = [
            {
                desvio: validacao.carboidrato.desvioPercentual,
                falta: "Inclua um carboidrato mais denso — farofa, pão, macarrão ou batata — além do que já escolheu.",
                sobra: "Troque um dos carboidratos por um vegetal ou uma fonte de proteína.",
            },
            {
                desvio: validacao.proteina.desvioPercentual,
                falta: "Inclua outra fonte de proteína — carne, peixe, ovo, queijo ou leguminosa.",
                sobra: "Troque uma das fontes de proteína por um vegetal ou um carboidrato.",
            },
            {
                desvio: validacao.gordura.desvioPercentual,
                falta: "Inclua uma fonte de gordura — azeite, castanhas, queijo ou manteiga.",
                sobra: "Remova ou troque a fonte de gordura mais concentrada desta refeição.",
            },
            {
                desvio: validacao.calorias.desvioPercentual,
                falta: "Escolha alimentos mais substanciais: esta refeição ficou leve demais para o tamanho dela.",
                sobra: "Escolha alimentos mais leves: esta refeição ficou pesada demais para o tamanho dela.",
            },
        ];

        const pior = candidatos
            .filter((c) => Math.abs(c.desvio) > DESVIO_ACEITAVEL_PERCENTUAL)
            .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))[0];

        if (!pior) return null;

        return pior.desvio < 0 ? pior.falta : pior.sobra;
    }
}
