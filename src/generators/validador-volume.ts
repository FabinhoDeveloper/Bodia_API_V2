import { Exercicio } from "../data/exercicios";
import {
    MAX_EXERCICIOS_POR_SESSAO,
    MAX_SERIES_POR_EXERCICIO,
    MIN_SERIES_POR_EXERCICIO,
} from "../data/volume-treino";
import { ResultadoCalculo } from "../types/perfil.types";
import {
    DesvioGrupo,
    PlanoGerado,
    ValidacaoSessao,
    ValidacaoVolume,
} from "../types/plano.types";

/**
 * Recalcula o volume de treino a partir dos exercícios que a IA escolheu e o
 * mede contra o orçamento do EngineService.
 *
 * Existe pelo mesmo motivo que o ValidadorMacros, e é o irmão que faltava: a
 * dieta tinha os números conferidos contra a TACO, e o treino não tinha
 * conferência nenhuma. O modelo podia devolver qualquer distribuição de séries
 * e ninguém notava — foi assim que um orçamento impossível passou despercebido.
 *
 * MEDE, NÃO LANÇA — mesma escolha do ValidadorMacros. Um desvio de uma série é
 * informação útil, não motivo para derrubar a geração inteira. Quem decide o
 * que fazer com o número é quem consome.
 */
export default class ValidadorVolume {
    /**
     * Uma série de folga por grupo. Não é arbitrário: com séries inteiras e um
     * orçamento como "7", a IA precisa somar 4+3 — mas 4+4 é uma escolha
     * defensável e não deveria reprovar o plano.
     */
    private static readonly DESVIO_ACEITAVEL_SERIES = 1;

    validar(
        plano: PlanoGerado,
        exercicios: Exercicio[],
        resultado: ResultadoCalculo,
    ): ValidacaoVolume {
        const grupoPorId = new Map(exercicios.map((e) => [e.id, e.grupoMuscular]));
        const orcamentoPorSessao = new Map(resultado.treino.sessoes.map((s) => [s.nome, s]));

        const sessoes = plano.treino.sessoes.map((sessao) =>
            this.validarSessao(sessao, grupoPorId, orcamentoPorSessao.get(sessao.nome)),
        );

        return {
            sessoes,
            dentroDoLimite: sessoes.every((s) => s.dentroDoLimite),
        };
    }

    private validarSessao(
        sessao: PlanoGerado["treino"]["sessoes"][number],
        grupoPorId: Map<number, string>,
        orcamento: ResultadoCalculo["treino"]["sessoes"][number] | undefined,
    ): ValidacaoSessao {
        const exercicios = sessao.exercicios ?? [];

        // Séries somadas por grupo, a partir do que a IA escolheu.
        const obtidoPorGrupo = new Map<string, number>();
        for (const exercicio of exercicios) {
            const grupo = grupoPorId.get(exercicio.exercicioId);
            if (!grupo) continue;
            obtidoPorGrupo.set(grupo, (obtidoPorGrupo.get(grupo) ?? 0) + exercicio.series);
        }

        const prescritos = orcamento?.volume ?? [];

        const grupos: DesvioGrupo[] = prescritos.map((item) => {
            const obtido = obtidoPorGrupo.get(item.grupo) ?? 0;
            return {
                grupo: item.grupo,
                prescrito: item.series,
                obtido,
                desvioSeries: obtido - item.series,
            };
        });

        // Grupo treinado sem estar no orçamento: o volume da sessão infla e o
        // tempo de treino também, mesmo que cada grupo prescrito feche certo.
        const prescritosNomes = new Set(prescritos.map((item) => item.grupo));
        const gruposForaDoOrcamento = [...obtidoPorGrupo.keys()].filter(
            (grupo) => !prescritosNomes.has(grupo),
        );

        const seriesForaDaFaixa = exercicios.some(
            (e) => e.series < MIN_SERIES_POR_EXERCICIO || e.series > MAX_SERIES_POR_EXERCICIO,
        );

        const dentroDoLimite =
            grupos.every(
                (g) => Math.abs(g.desvioSeries) <= ValidadorVolume.DESVIO_ACEITAVEL_SERIES,
            ) &&
            gruposForaDoOrcamento.length === 0 &&
            exercicios.length <= MAX_EXERCICIOS_POR_SESSAO &&
            !seriesForaDaFaixa;

        return {
            sessao: sessao.nome,
            grupos,
            gruposForaDoOrcamento,
            quantidadeExercicios: exercicios.length,
            dentroDoLimite,
        };
    }
}
