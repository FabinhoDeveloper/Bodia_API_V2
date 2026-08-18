import { ALIMENTOS } from "../data/alimentos";
import { PLANO_SIMULADO } from "../data/planoSimulado";
import { PerfilParaPlano, ResultadoCalculo } from "../types/perfil.types";
import { PlanoValidado } from "../types/plano.types";
import ValidadorMacros from "./validador-macros";

/**
 * Substitui o LLM enquanto o fluxo da IA está desativado (flag SIMULAR_IA).
 * Devolve o fixture de src/data/planoSimulado.ts com a MESMA assinatura e o
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

    constructor(validadorMacros: ValidadorMacros) {
        this.validadorMacros = validadorMacros;
    }

    async gerar(_perfil: PerfilParaPlano, resultado: ResultadoCalculo): Promise<PlanoValidado> {
        return {
            plano: PLANO_SIMULADO,
            validacao: this.validadorMacros.validar(PLANO_SIMULADO, ALIMENTOS, resultado),
        };
    }
}
