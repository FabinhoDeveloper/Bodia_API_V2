import { NivelAtividade, NivelExperiencia, Objetivo, PrismaClient, Sexo } from "@prisma/client";

import { ContaInput, PerfilOnboardingInput, ResultadoCalculo } from "../types/perfil.types";
import { PlanoDTO } from "../types/plano.types";

// O app manda minúsculo ("sedentario", "perder") e o banco usa enum maiúsculo.
// A tradução mora aqui, num lugar só, em vez de espalhada pelos services.
const ATIVIDADE: Record<string, NivelAtividade> = {
    sedentario: "SEDENTARIO",
    leve: "LEVE",
    moderado: "MODERADO",
    intenso: "INTENSO",
    atleta: "ATLETA",
};

const EXPERIENCIA: Record<string, NivelExperiencia> = {
    iniciante: "INICIANTE",
    intermediario: "INTERMEDIARIO",
    avancado: "AVANCADO",
};

const OBJETIVO: Record<string, Objetivo> = {
    perder: "PERDER",
    manter: "MANTER",
    ganhar: "GANHAR",
};

export interface CadastroCompleto {
    conta: ContaInput;
    perfil: PerfilOnboardingInput;
    plano: PlanoDTO;
    /// Recalculado pelo service — traz tmb, tdee, frequência e macros por
    /// refeição, que o PlanoDTO não carrega.
    resultado: ResultadoCalculo;
    senhaHash: string;
}

export default class UserRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }

    buscarPorEmail(email: string) {
        return this.prismaClient.usuario.findUnique({ where: { email } });
    }

    /**
     * Cria o cadastro inteiro de uma vez: usuário, primeiro registro de peso,
     * restrições e as duas fichas com todos os filhos.
     *
     * O `create` aninhado do Prisma roda numa transação só — ou nasce tudo, ou
     * nada. Sem isso, uma falha no meio deixaria um usuário sem ficha, que é
     * pior que não ter usuário nenhum.
     */
    criar({ conta, perfil, plano, resultado, senhaHash }: CadastroCompleto) {
        // A frequência da sessão e os macros da refeição vêm do cálculo, não do
        // plano — casados pelo nome, que é o que os dois lados têm em comum.
        const frequenciaPorSessao = new Map(
            resultado.treino.sessoes.map((sessao) => [sessao.nome, sessao.frequenciaSemanal]),
        );
        const metaPorRefeicao = new Map(
            resultado.dieta.refeicoes.map((refeicao) => [refeicao.nome, refeicao]),
        );

        const restricoes = [
            ...perfil.restricoesAlimentares.map((descricao) => ({
                tipo: "ALIMENTAR" as const,
                descricao,
            })),
            ...perfil.restricoesFisicas.map((descricao) => ({
                tipo: "FISICA" as const,
                descricao,
            })),
        ];

        return this.prismaClient.usuario.create({
            data: {
                nome: conta.nome,
                sobrenome: conta.sobrenome,
                email: conta.email,
                senhaHash,

                sexo: perfil.sexo as Sexo,
                dataNascimento: new Date(perfil.dataNascimento),
                alturaCm: perfil.altura,
                percentualGordura: perfil.percentualGordura,
                nivelAtividade: ATIVIDADE[perfil.nivelAtividade],
                nivelExperiencia: EXPERIENCIA[perfil.nivelExperiencia],
                objetivo: OBJETIVO[perfil.objetivo],
                diasPorSemana: perfil.diasPorSemana,
                numeroRefeicoes: perfil.numeroRefeicoes ?? 4,

                // O peso informado no onboarding é o primeiro ponto do histórico.
                pesos: { create: [{ pesoKg: perfil.peso }] },

                restricoes: { create: restricoes },

                fichasTreino: {
                    create: [
                        {
                            split: plano.treino.split,
                            diasPorSemana: plano.treino.diasPorSemana,
                            seriesPorGrupoSemana: resultado.treino.seriesPorGrupoSemana,
                            sessoes: {
                                create: plano.treino.sessoes.map((sessao, indice) => ({
                                    nome: sessao.nome,
                                    diaSemana: sessao.dia,
                                    frequenciaSemanal: frequenciaPorSessao.get(sessao.nome) ?? 1,
                                    ordem: indice,
                                    exercicios: {
                                        create: sessao.exercicios.map((exercicio, posicao) => ({
                                            exercicioId: exercicio.exercicioId,
                                            series: exercicio.series,
                                            repeticoes: exercicio.repeticoes,
                                            descansoSegundos: exercicio.descansoSegundos,
                                            ordem: posicao,
                                            // ultimoPesoKg fica null: o usuário
                                            // ainda não fez este exercício.
                                        })),
                                    },
                                })),
                            },
                        },
                    ],
                },

                fichasAlimentacao: {
                    create: [
                        {
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
                        },
                    ],
                },
            },
        });
    }
}
