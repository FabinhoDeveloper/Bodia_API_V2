import { ALIMENTOS } from "../data/alimentos";
import { EXERCICIOS } from "../data/exercicios";
import { PLANO_SIMULADO } from "../data/plano-simulado";
import { PerfilParaPlano, ResultadoCalculo } from "../types/perfil.types";
import { PlanoValidado } from "../types/plano.types";
import ValidadorMacros from "./validador-macros";
import ValidadorVolume from "./validador-volume";

/**
 * Substitui o LLM enquanto o fluxo da IA está desativado (flag SIMULAR_IA).
 * Devolve o fixture de src/data/plano-simulado.ts com a MESMA assinatura e o
 * mesmo tipo de retorno do PlanoIaGenerator, então quem chama não sabe a
 * diferença.
 *
 * A validação de macros é feita de verdade contra as metas do perfil, pelo
 * mesmo ValidadorMacros que o gerador da IA usa. Como o fixture é fixo, os
 * desvios saem altos — isso é esperado e serve justamente para deixar visível
 * no log que aquele plano não foi feito para o usuário.
 */
export default class PlanoSimuladoGenerator {
    private readonly validadorMacros;
    private readonly validadorVolume;

    constructor(validadorMacros: ValidadorMacros, validadorVolume: ValidadorVolume) {
        this.validadorMacros = validadorMacros;
        this.validadorVolume = validadorVolume;
    }

    async gerar(_perfil: PerfilParaPlano, resultado: ResultadoCalculo): Promise<PlanoValidado> {
        return {
            plano: PLANO_SIMULADO,
            validacao: this.validadorMacros.validar(PLANO_SIMULADO, ALIMENTOS, resultado),
            // Catálogo completo, e não o filtrado: o fixture é fixo e não conhece
            // as restrições do usuário — filtrar só faria sumir exercício da conta.
            validacaoVolume: this.validadorVolume.validar(PLANO_SIMULADO, EXERCICIOS, resultado),
        };
    }
}
