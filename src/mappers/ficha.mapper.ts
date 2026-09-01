import { ResultadoCalculo } from "../types/perfil.types";
import { PlanoDTO } from "../types/plano.types";

/**
 * Traduz o plano aprovado (PlanoDTO + ResultadoCalculo) na forma que o Prisma
 * grava — a ficha de treino e a de alimentação, com todos os filhos.
 *
 * Existe porque DOIS repositories precisam exatamente disto: o `UserRepository`
 * ao criar o cadastro, aninhado no `create` do usuário, e o `PlanRepository` ao
 * regenerar o plano (RF20), com o usuário já existindo. Duas cópias divergiriam
 * na primeira coluna nova — é o mesmo motivo pelo qual o cálculo dos macros
 * passou a viver só no `validador-macros`.
 *
 * Fica em `mappers/` porque é tradução de formato, não acesso a dados: aqui não
 * há `PrismaClient` nem consulta, só a montagem do objeto que os repositories
 * entregam a ele.
 */
export default class FichaMapper {
    /**
     * Os dados da FichaTreino, sem o `usuarioId`.
     *
     * A frequência de cada sessão vem do CÁLCULO, não do plano, casada pelo nome
     * — é o que os dois lados têm em comum. O plano não a carrega porque a tela
     * não a usa.
     */
    treino(plano: PlanoDTO, resultado: ResultadoCalculo) {
        const frequenciaPorSessao = new Map(
            resultado.treino.sessoes.map((sessao) => [sessao.nome, sessao.frequenciaSemanal]),
        );

        return {
            split: plano.treino.split,
            diasPorSemana: plano.treino.diasPorSemana,
            seriesPorGrupoSemana: resultado.treino.seriesPorGrupoSemana,
            sessoes: {
                create: plano.treino.sessoes.map((sessao, indice) => ({
                    nome: sessao.nome,
                    diasSemana: sessao.diasSemana,
                    frequenciaSemanal: frequenciaPorSessao.get(sessao.nome) ?? 1,
                    ordem: indice,
                    exercicios: {
                        create: sessao.exercicios.map((exercicio, posicao) => ({
                            exercicioId: exercicio.exercicioId,
                            series: exercicio.series,
                            repeticoes: exercicio.repeticoes,
                            descansoSegundos: exercicio.descansoSegundos,
                            ordem: posicao,
                        })),
                    },
                })),
            },
        };
    }

    /**
     * Os dados da FichaAlimentacao, sem o `usuarioId`.
     *
     * Os macros de cada refeição vêm do CÁLCULO pelo mesmo motivo da frequência:
     * o PlanoDTO só carrega as kcal, que é o que a tela mostra.
     */
    alimentacao(plano: PlanoDTO, resultado: ResultadoCalculo) {
        const metaPorRefeicao = new Map(
            resultado.dieta.refeicoes.map((refeicao) => [refeicao.nome, refeicao]),
        );

        return {
            tmb: resultado.metabolismo.tmb,
            tdee: resultado.metabolismo.tdee,
            caloriasAlvo: plano.metas.calorias,
            proteinaG: plano.metas.proteinaG,
            carboidratoG: plano.metas.carboidratoG,
            gorduraG: plano.metas.gorduraG,
            metaAguaMl: plano.metas.aguaMl,
            refeicoes: {
                create: plano.dieta.refeicoes.map((refeicao, indice) => {
                    const meta = metaPorRefeicao.get(refeicao.nome);

                    return {
                        nome: refeicao.nome,
                        horario: refeicao.horario,
                        ordem: indice,
                        kcal: meta?.kcal ?? refeicao.kcal,
                        proteinaG: meta?.proteina ?? 0,
                        carboidratoG: meta?.carboidrato ?? 0,
                        gorduraG: meta?.gordura ?? 0,
                        itens: {
                            create: refeicao.itens.map((item) => ({
                                alimentoId: item.alimentoId,
                                gramas: item.gramas,
                            })),
                        },
                    };
                }),
            },
        };
    }
}
