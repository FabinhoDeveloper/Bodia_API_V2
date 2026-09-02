import { Alimento } from "../data/alimentos";
import { faixaDe } from "../data/porcoes";

/** A meta de UMA refeição, como o EngineService a produz em `calcularDieta`. */
export interface MetaRefeicao {
    kcal: number;
    proteina: number;
    carboidrato: number;
    gordura: number;
}

export interface PorcaoResolvida {
    alimentoId: number;
    gramas: number;
}

/** Os quatro alvos, e o peso de cada um no custo. */
type Alvo = keyof MetaRefeicao;

/**
 * O quanto errar em cada alvo incomoda.
 *
 * A caloria pesa mais porque é o número que o usuário vê na tela e o que decide
 * se ele emagrece ou engorda. A gordura pesa menos porque é o alvo mais difícil
 * de alcançar quando a refeição não tem nenhuma fonte de gordura: sem esse
 * desconto, um almoço de arroz, feijão e frango sacrificaria proteína e caloria
 * numa perseguição que as faixas de porção não permitem vencer.
 *
 * São pesos de um custo, não tolerâncias. Quem define o que é desvio aceitável
 * continua sendo `DESVIO_ACEITAVEL_PERCENTUAL`, no validador.
 */
const PESO: Record<Alvo, number> = {
    kcal: 1.5,
    proteina: 1,
    carboidrato: 1,
    gordura: 0.6,
};

const ALVOS: readonly Alvo[] = ["kcal", "proteina", "carboidrato", "gordura"];

/** Quanto cada alvo vale por 100 g do alimento — os nomes diferem dos da meta. */
function por100g(alimento: Alimento, alvo: Alvo): number {
    return alvo === "kcal" ? alimento.kcal : alimento[alvo];
}

/**
 * Teto de rodadas de descida. Cada rodada mexe num alimento só, e o custo nunca
 * sobe, então o laço termina sozinho quando ninguém tem mais o que melhorar. O
 * teto só protege contra oscilação por erro de ponto flutuante.
 */
const MAX_RODADAS = 60;

/** Abaixo disto a melhora não muda grama nenhuma depois do arredondamento. */
const MELHORA_MINIMA = 1e-6;

/**
 * Resolve as gramas de cada alimento de uma refeição.
 *
 * Esta etapa era a CHAMADA 2 à IA: o modelo recebia as quatro metas e devolvia
 * as gramas. Medido, ele errava para cima — 30% de caloria e 72% de proteína
 * acima da própria meta, com 400 g de arroz num almoço e 500 g num jantar — e
 * nada conferia o resultado, porque a única validação era `gramas > 0`. É
 * aritmética com restrições sobre um punhado de números: exatamente o que a
 * fundamentação do projeto diz que LLM não faz bem, e o que um motor
 * determinístico faz de olhos fechados.
 *
 * O LLM continua fazendo o que ele faz bem, na chamada 1: ESCOLHER alimentos
 * plausíveis para uma refeição brasileira.
 *
 * ## Como resolve
 *
 * Descida coordenada sobre o custo: a soma dos desvios relativos ao quadrado
 * dos quatro alvos, ponderada por `PESO`. Cada rodada calcula, para cada
 * alimento, a grama que MINIMIZA o custo mantendo os outros parados — o custo é
 * quadrático numa variável só, então esse mínimo tem fórmula fechada — e aplica
 * a mudança de maior ganho, limitada à faixa de `data/porcoes.ts`.
 *
 * A escolha do método é o que separa este solver da primeira tentativa, que
 * fechava um macro por vez em sequência. Ali, um alvo inalcançável empurrava sua
 * alavanca até o teto e destruía os outros três: num almoço sem nenhuma fonte de
 * gordura, perseguir 28 g de gordura levava o frango a 250 g e a proteína a
 * +51%. Aqui o custo é global e nunca sobe, então um alvo impossível
 * simplesmente para de render melhora e o resto continua fechado.
 *
 * ## Infeasibilidade é resultado, não erro
 *
 * As faixas de `data/porcoes.ts` são limite duro. Se a meta não couber dentro
 * delas, o solver entrega o melhor prato possível e quem reporta a diferença é o
 * `validador-macros`, que já existe e já mede exatamente isso.
 *
 * Preferir um prato comestível com desvio honesto a um prato que fecha a
 * planilha e ninguém come é a decisão central deste arquivo.
 */
export default class PorcoesSolver {
    resolver(alimentos: Alimento[], meta: MetaRefeicao): PorcaoResolvida[] {
        // Parte da porção usual: é o prato que um humano montaria sem
        // calculadora, e deixa a descida com pouco caminho a percorrer.
        const gramas = alimentos.map((a) => faixaDe(a).usual);

        for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
            let melhorIndice = -1;
            let melhorGramas = 0;
            let melhorGanho = MELHORA_MINIMA;

            const custoAtual = this.custo(alimentos, gramas, meta);

            for (let i = 0; i < alimentos.length; i++) {
                for (const candidato of this.candidatosPara(alimentos, gramas, meta, i)) {
                    const ganho =
                        custoAtual - this.custo(alimentos, this.com(gramas, i, candidato), meta);

                    if (ganho > melhorGanho) {
                        melhorGanho = ganho;
                        melhorIndice = i;
                        melhorGramas = candidato;
                    }
                }
            }

            if (melhorIndice < 0) break;

            gramas[melhorIndice] = melhorGramas;
        }

        return alimentos.map((a, i) => ({ alimentoId: a.id, gramas: gramas[i] }));
    }

    /**
     * As gramas que vale a pena testar para o alimento `i`: o ótimo contínuo
     * levado à grade de servir, e os dois vizinhos dela.
     *
     * A grade entra AQUI, e não num arredondamento no fim, porque arredondar
     * depois é cego ao custo: 5 g de azeite são 44 kcal e 18% da meta de gordura
     * de um almoço, e um passo desses aplicado por fora jogava para fora da
     * tolerância um prato que a descida tinha fechado.
     *
     * Testar os vizinhos importa porque a grade é grossa: o ótimo contínuo pode
     * cair entre dois pontos e o melhor deles nem sempre é o mais próximo,
     * já que o custo mistura quatro alvos com pesos diferentes.
     */
    private candidatosPara(
        alimentos: Alimento[],
        gramas: number[],
        meta: MetaRefeicao,
        i: number,
    ): number[] {
        const faixa = faixaDe(alimentos[i]);
        const otimo = this.otimoDe(alimentos, gramas, meta, i);
        const passo = this.passoDe(otimo, faixa);

        return [...new Set([otimo - passo, otimo, otimo + passo])].map((valor) =>
            this.arredondar(valor, faixa),
        );
    }

    /**
     * A grama do alimento `i` que minimiza o custo com os outros parados.
     *
     * Derivada do custo igualada a zero. Com `v` = valor por 100 g, `A` = alvo e
     * `C` = o que os outros alimentos já somam naquele alvo:
     *
     *     g = -100 · Σ p·v·(C − A)/A²  ÷  Σ p·v²/A²
     *
     * Alimento que não contribui para alvo nenhum tem denominador zero — o
     * catálogo não tem nenhum, mas devolver a grama atual mantém a conta segura.
     */
    private otimoDe(
        alimentos: Alimento[],
        gramas: number[],
        meta: MetaRefeicao,
        i: number,
    ): number {
        let numerador = 0;
        let denominador = 0;

        for (const alvo of ALVOS) {
            const A = meta[alvo];
            if (A <= 0) continue;

            const v = por100g(alimentos[i], alvo);
            if (v === 0) continue;

            const C = this.total(alimentos, gramas, alvo) - (v * gramas[i]) / 100;
            const escala = PESO[alvo] / (A * A);

            numerador += escala * v * (C - A);
            denominador += escala * v * v;
        }

        if (denominador === 0) return gramas[i];

        return this.limitar((-100 * numerador) / denominador, faixaDe(alimentos[i]));
    }

    private custo(alimentos: Alimento[], gramas: number[], meta: MetaRefeicao): number {
        return ALVOS.reduce((soma, alvo) => {
            const A = meta[alvo];
            if (A <= 0) return soma;

            const desvio = (this.total(alimentos, gramas, alvo) - A) / A;

            return soma + PESO[alvo] * desvio * desvio;
        }, 0);
    }

    private total(alimentos: Alimento[], gramas: number[], alvo: Alvo): number {
        return alimentos.reduce((soma, a, i) => soma + (por100g(a, alvo) * gramas[i]) / 100, 0);
    }

    /**
     * Leva a um número que se possa servir: de 5 em 5 g abaixo de 50 g, de 10 em
     * 10 acima. "163 g de arroz" tem uma precisão que a balança da cozinha não
     * tem e que a própria TACO não sustenta.
     *
     * O limite volta depois: arredondar para cima em cima do teto o estouraria
     * por poucos gramas.
     */
    private arredondar(valor: number, faixa: { min: number; max: number }): number {
        const passo = this.passoDe(valor, faixa);

        return this.limitar(Math.round(valor / passo) * passo, faixa);
    }

    /**
     * De quanto em quanto as gramas andam.
     *
     * Grosso para o que se serve às colheradas — 5 g de arroz não mudam prato
     * nenhum, e "163 g" tem uma precisão que a balança da cozinha não tem. Fino
     * para o que cabe todo em 30 g: um passo de 5 g no azeite é um sexto da
     * faixa inteira e 18% da meta de gordura de um almoço, e era ele que jogava
     * a gordura para fora da tolerância. Receita mede azeite em mililitro
     * mesmo.
     */
    private passoDe(valor: number, faixa: { max: number }): number {
        if (faixa.max <= 30) return 1;

        return valor < 50 ? 5 : 10;
    }

    private limitar(valor: number, faixa: { min: number; max: number }): number {
        return Math.min(faixa.max, Math.max(faixa.min, valor));
    }

    private com(gramas: number[], i: number, valor: number): number[] {
        const copia = [...gramas];
        copia[i] = valor;

        return copia;
    }
}
