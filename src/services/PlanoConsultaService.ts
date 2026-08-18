import NaoEncontradoError from "../errors/NaoEncontradoError";
import PlanoConsultaRepository from "../repositories/PlanoConsultaRepository";
import { MeuPlano } from "../types/plano.types";

/**
 * Monta o plano ativo no formato que as telas principais consomem — Home,
 * Treino, Dieta e Perfil, numa resposta só.
 *
 * Só devolve a PRESCRIÇÃO. O que o usuário registrou (água do dia, refeição
 * marcada, treino concluído) ainda não é persistido e continua local no app.
 */
export default class PlanoConsultaService {
    private readonly planoConsultaRepository;

    constructor(planoConsultaRepository: PlanoConsultaRepository) {
        this.planoConsultaRepository = planoConsultaRepository;
    }

    async buscar(usuarioId: string): Promise<MeuPlano> {
        const usuario = await this.planoConsultaRepository.buscarPlanoAtivo(usuarioId);

        if (!usuario) {
            throw new NaoEncontradoError("Usuário não encontrado");
        }

        const fichaTreino = usuario.fichasTreino[0];
        const fichaAlimentacao = usuario.fichasAlimentacao[0];

        if (!fichaTreino || !fichaAlimentacao) {
            throw new NaoEncontradoError("Usuário ainda não tem um plano ativo");
        }

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
                        diaSemana: sessao.diaSemana,
                        // Derivado dos exercícios, sem repetir — é o subtítulo do
                        // card. Não é coluna no banco justamente para não poder
                        // contradizer a lista.
                        gruposMusculares: [...new Set(exercicios.map((e) => e.grupoMuscular))].join(", "),
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
