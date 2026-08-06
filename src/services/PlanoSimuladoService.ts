import { ALIMENTOS } from "../data/alimentos";
import { PLANO_SIMULADO } from "../data/planoSimulado";
import { ResultadoCalculo } from "./CalculoService";
import { PerfilParaPlano, PlanoValidado, Validacao } from "./PlanoService";

/**
 * Substitui o LLM enquanto o fluxo da IA está desativado (flag SIMULAR_IA).
 * Devolve o fixture de src/data/planoSimulado.ts com a MESMA assinatura e o
 * mesmo tipo de retorno do PlanoService, então quem chama não sabe a diferença.
 *
 * A validação de macros é feita de verdade contra as metas do perfil. Como o
 * fixture é fixo, os desvios saem altos — isso é esperado e serve justamente
 * para deixar visível no log que aquele plano não foi feito para o usuário.
 */
export default class PlanoSimuladoService {
    private static readonly DESVIO_ACEITAVEL_PERCENTUAL = 5;

    async gerar(_perfil: PerfilParaPlano, resultado: ResultadoCalculo): Promise<PlanoValidado> {
        return { plano: PLANO_SIMULADO, validacao: this.validarMacros(resultado) };
    }

    private validarMacros(resultado: ResultadoCalculo): Validacao {
        const porId = new Map(ALIMENTOS.map((a) => [a.id, a]));
        const total = { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 };

        for (const refeicao of PLANO_SIMULADO.dieta.refeicoes) {
            for (const item of refeicao.itens) {
                const alimento = porId.get(item.alimentoId);
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
                PlanoSimuladoService.DESVIO_ACEITAVEL_PERCENTUAL,
        );

        return { calorias, proteina, carboidrato, gordura, dentroDoLimite };
    }

    private compararComMeta(meta: number, obtido: number) {
        const arredondado = Math.round(obtido * 10) / 10;
        const desvioPercentual = meta === 0 ? 0 : ((arredondado - meta) / meta) * 100;

        return {
            meta,
            obtido: arredondado,
            desvioPercentual: Math.round(desvioPercentual * 10) / 10,
        };
    }
}
