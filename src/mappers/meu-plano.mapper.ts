import PlanRepository from "../repositories/plan.repository";
import { MeuPlano } from "../types/plano.types";

/** O usuário como o PlanRepository o devolve, já com as fichas incluídas. */
type UsuarioComPlano = NonNullable<Awaited<ReturnType<PlanRepository["buscarPlanoAtivo"]>>>;

type FichaTreino = UsuarioComPlano["fichasTreino"][number];
type FichaAlimentacao = UsuarioComPlano["fichasAlimentacao"][number];

/**
 * Converte o que veio do banco no formato que as telas principais consomem —
 * Home, Treino, Dieta e Perfil, numa resposta só.
 *
 * Só monta a PRESCRIÇÃO. O que o usuário registrou (água do dia, refeição
 * marcada, treino concluído) ainda não é persistido e continua local no app.
 *
 * Fica aqui, e não no PlanService, porque é o mesmo tipo de trabalho do
 * plano.mapper — traduzir entre o formato interno e o contrato da API —, só
 * que na direção da leitura.
 */
export default class MeuPlanoMapper {
    montar(
        usuario: UsuarioComPlano,
        fichaTreino: FichaTreino,
        fichaAlimentacao: FichaAlimentacao,
    ): MeuPlano {
        return {
            usuario: {
                nome: usuario.nome,
                sobrenome: usuario.sobrenome,
                email: usuario.email,
                alturaCm: usuario.alturaCm,
                objetivo: usuario.objetivo,
                pesoAtualKg: usuario.pesos[0]?.pesoKg ?? null,
            },
            treino: {
                split: fichaTreino.split,
                diasPorSemana: fichaTreino.diasPorSemana,
                sessoes: fichaTreino.sessoes.map((sessao) => {
                    const exercicios = sessao.exercicios.map((item) => ({
                        id: item.id,
                        exercicioId: item.exercicioId,
                        nome: item.exercicio.nome,
                        grupoMuscular: item.exercicio.grupoMuscular,
                        series: item.series,
                        repeticoes: item.repeticoes,
                        descansoSegundos: item.descansoSegundos,
                        ultimoPesoKg: item.ultimoPesoKg,
                    }));

                    return {
                        id: sessao.id,
                        nome: sessao.nome,
                        diasSemana: sessao.diasSemana,
                        // Derivado dos exercícios, sem repetir — é o subtítulo do
                        // card. Não é coluna no banco justamente para não poder
                        // contradizer a lista.
                        gruposMusculares: [
                            ...new Set(exercicios.map((e) => e.grupoMuscular)),
                        ].join(", "),
                        exercicios,
                    };
                }),
            },
            dieta: {
                metas: {
                    calorias: fichaAlimentacao.caloriasAlvo,
                    proteinaG: fichaAlimentacao.proteinaG,
                    carboidratoG: fichaAlimentacao.carboidratoG,
                    gorduraG: fichaAlimentacao.gorduraG,
                    aguaMl: fichaAlimentacao.metaAguaMl,
                },
                refeicoes: fichaAlimentacao.refeicoes.map((refeicao) => ({
                    id: refeicao.id,
                    nome: refeicao.nome,
                    horario: refeicao.horario,
                    kcal: refeicao.kcal,
                    proteinaG: refeicao.proteinaG,
                    carboidratoG: refeicao.carboidratoG,
                    gorduraG: refeicao.gorduraG,
                    itens: refeicao.itens.map((item) => ({
                        alimentoId: item.alimentoId,
                        nome: item.alimento.nome,
                        gramas: item.gramas,
                        kcal: Math.round((item.alimento.kcal * item.gramas) / 100),
                    })),
                })),
            },
        };
    }
}
