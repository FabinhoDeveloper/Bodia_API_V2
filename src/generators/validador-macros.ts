import { Alimento } from "../data/alimentos";
import { ResultadoCalculo } from "../types/perfil.types";
import { DesvioMacro, PlanoGerado, Validacao } from "../types/plano.types";

/**
 * Tolerância aceita entre o recalculado e a meta do motor, em pontos
 * percentuais.
 *
 * EXPORTADA porque três lugares precisam dela: este validador, que a aplica; a
 * resposta do onboarding, que a informa ao app para que o usuário saiba contra
 * o que o desvio está sendo medido; e o teste, que a confere. Um limite que só
 * existe dentro da função que o aplica não pode ser citado por nenhum dos dois
 * outros — mesmo raciocínio dos limites de volume-treino.ts.
 */
export const DESVIO_ACEITAVEL_PERCENTUAL = 5;

/**
 * Recalcula os totais da dieta a partir dos valores da TACO e das gramas
 * propostas, e mede o desvio contra a meta do EngineService. O número final
 * nunca é aceito na palavra de quem montou o plano.
 *
 * Os dois geradores usam este mesmo validador. Antes cada um tinha a sua
 * cópia, idêntica linha a linha — inclusive a tolerância —, o que significava
 * que corrigir a conta num deles deixava o outro medindo diferente.
 */
export default class ValidadorMacros {
    validar(plano: PlanoGerado, alimentos: Alimento[], resultado: ResultadoCalculo): Validacao {
        const porId = new Map(alimentos.map((a) => [a.id, a]));
        const total = { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 };

        for (const refeicao of plano.dieta.refeicoes) {
            for (const item of refeicao.itens ?? []) {
                const alimento = porId.get(item.alimentoId);

                // O gerador da IA valida os ids antes de chegar aqui; o
                // simulado não, e o fixture pode citar um alimento que o
                // catálogo filtrado não tem. Ignorar mantém a conta possível.
                if (!alimento) continue;

                const fator = item.gramas / 100;

                total.kcal += alimento.kcal * fator;
                total.proteina += alimento.proteina * fator;
                total.carboidrato += alimento.carboidrato * fator;
                total.gordura += alimento.gordura * fator;
            }
        }

        const calorias = this.compararComMeta(resultado.meta.caloriasAlvo, total.kcal);
        const proteina = this.compararComMeta(resultado.macros.proteina.g, total.proteina);
        const carboidrato = this.compararComMeta(resultado.macros.carboidrato.g, total.carboidrato);
        const gordura = this.compararComMeta(resultado.macros.gordura.g, total.gordura);

        const dentroDoLimite = [calorias, proteina, carboidrato, gordura].every(
            (macro) =>
                Math.abs(macro.desvioPercentual) <=
                DESVIO_ACEITAVEL_PERCENTUAL,
        );

        return { calorias, proteina, carboidrato, gordura, dentroDoLimite };
    }

    private compararComMeta(meta: number, obtido: number): DesvioMacro {
        const arredondado = Math.round(obtido * 10) / 10;
        const desvioPercentual = meta === 0 ? 0 : ((arredondado - meta) / meta) * 100;

        return {
            meta,
            obtido: arredondado,
            desvioPercentual: Math.round(desvioPercentual * 10) / 10,
        };
    }
}
