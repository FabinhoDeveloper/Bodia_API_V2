import { ALIMENTOS } from "../data/alimentos";
import { EXERCICIOS } from "../data/exercicios";
import { ResultadoCalculo } from "../types/perfil.types";
import {
    PlanoDTO,
    PlanoGerado,
    RefeicaoDTO,
    SessaoTreinoDTO,
} from "../types/plano.types";

// Nem o LLM nem o EngineService produzem dia da semana ou horário — são
// apresentação. Ficam aqui, num lugar só, em vez de espalhados pelo app.
const DIAS_POR_QUANTIDADE: Record<number, string[]> = {
    2: ["Segunda", "Quinta"],
    3: ["Segunda", "Quarta", "Sexta"],
    4: ["Segunda", "Terça", "Quinta", "Sexta"],
    5: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    6: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
};

const HORARIO_POR_REFEICAO: Record<string, string> = {
    "Café da manhã": "07:30",
    "Lanche da manhã": "10:00",
    Almoço: "12:30",
    "Lanche da tarde": "16:00",
    Jantar: "20:00",
    Ceia: "22:00",
};

const META_AGUA_ML = 2000;

/**
 * Converte o plano cru (o que o LLM devolve, ou o fixture simulado) no formato
 * que o app consome, juntando três fontes: a seleção de itens, os números do
 * EngineService e os dados dos catálogos (grupo muscular, kcal por 100 g).
 *
 * É o único lugar que conhece o contrato da API — os dois geradores, IA e
 * simulado, passam por aqui.
 */
export default class PlanoMapper {
    montar(plano: PlanoGerado, resultado: ResultadoCalculo): PlanoDTO {
        return {
            metas: {
                calorias: resultado.meta.caloriasAlvo,
                proteinaG: resultado.macros.proteina.g,
                carboidratoG: resultado.macros.carboidrato.g,
                gorduraG: resultado.macros.gordura.g,
                aguaMl: META_AGUA_ML,
            },
            treino: {
                split: resultado.treino.split,
                diasPorSemana: resultado.treino.diasPorSemana,
                sessoes: this.montarSessoes(plano, resultado),
            },
            dieta: {
                refeicoes: this.montarRefeicoes(plano, resultado),
            },
            observacoes: plano.observacoes,
        };
    }

    private montarSessoes(plano: PlanoGerado, resultado: ResultadoCalculo): SessaoTreinoDTO[] {
        const dias = DIAS_POR_QUANTIDADE[resultado.treino.diasPorSemana] ?? [];
        const diasPorSessao = this.repartirDias(dias, resultado.treino.sessoes);
        const porId = new Map(EXERCICIOS.map((e) => [e.id, e]));

        return plano.treino.sessoes.map((sessao, indice) => {
            const exercicios = sessao.exercicios.map((exercicio) => {
                const doCatalogo = porId.get(exercicio.exercicioId);

                return {
                    exercicioId: exercicio.exercicioId,
                    nome: doCatalogo?.nome ?? exercicio.nome,
                    grupoMuscular: doCatalogo?.grupoMuscular ?? "",
                    series: exercicio.series,
                    repeticoes: exercicio.repeticoes,
                    descansoSegundos: 60,
                };
            });

            // Os grupos musculares da sessão saem dos exercícios escolhidos, sem
            // repetir e na ordem em que aparecem — é o subtítulo do card na tela.
            const gruposMusculares = [...new Set(exercicios.map((e) => e.grupoMuscular))]
                .filter(Boolean)
                .join(", ");

            return {
                nome: sessao.nome,
                diasSemana: diasPorSessao[indice] ?? [],
                gruposMusculares,
                exercicios,
            };
        });
    }

    /**
     * Reparte os dias da semana entre as sessões, respeitando a frequência de
     * cada uma.
     *
     * Antes era `dias[indice]`, uma sessão por dia — e com 4 dias em Upper/Lower
     * (2 sessões, 2x cada) só Segunda e Terça eram usados: Quinta e Sexta
     * sumiam. O usuário pedia 4 dias de treino e o app mostrava 2.
     *
     * Distribui em rodadas, não em blocos: Upper fica com Segunda e Quinta, e
     * não com Segunda e Terça. Treinar o mesmo grupo em dias consecutivos e
     * depois folgar não é o que a frequência semanal pretende.
     */
    private repartirDias(
        dias: string[],
        sessoes: ResultadoCalculo["treino"]["sessoes"],
    ): string[][] {
        const porSessao: string[][] = sessoes.map(() => []);
        const restante = sessoes.map((sessao) => sessao.frequenciaSemanal);

        let indice = 0;
        for (const dia of dias) {
            // Procura a próxima sessão que ainda tem repetição a cumprir.
            for (let tentativa = 0; tentativa < sessoes.length; tentativa++) {
                const alvo = (indice + tentativa) % sessoes.length;

                if (restante[alvo] > 0) {
                    porSessao[alvo].push(dia);
                    restante[alvo] -= 1;
                    indice = alvo + 1;
                    break;
                }
            }
        }

        return porSessao;
    }

    private montarRefeicoes(plano: PlanoGerado, resultado: ResultadoCalculo): RefeicaoDTO[] {
        const porId = new Map(ALIMENTOS.map((a) => [a.id, a]));
        const metaPorNome = new Map(resultado.dieta.refeicoes.map((r) => [r.nome, r]));

        return plano.dieta.refeicoes.map((refeicao) => {
            const itens = refeicao.itens.map((item) => {
                const alimento = porId.get(item.alimentoId);

                return {
                    alimentoId: item.alimentoId,
                    nome: alimento?.nome ?? item.nome,
                    gramas: item.gramas,
                    kcal: Math.round(((alimento?.kcal ?? 0) * item.gramas) / 100),
                };
            });

            // As kcal da refeição são a soma real dos itens, não a meta: é o que o
            // usuário vai de fato comer se seguir aquela lista.
            const kcal = itens.reduce((total, item) => total + item.kcal, 0);

            return {
                nome: refeicao.nome,
                horario: HORARIO_POR_REFEICAO[refeicao.nome] ?? "",
                kcal,
                itens,
            };
        });
    }
}
