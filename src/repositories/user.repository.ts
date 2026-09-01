import { Prisma, PrismaClient, Sexo, TipoRestricao } from "@prisma/client";

import FichaMapper from "../mappers/ficha.mapper";
import PerfilMapper from "../mappers/perfil.mapper";
import { ContaInput, PerfilOnboardingInput, ResultadoCalculo } from "../types/perfil.types";
import { PlanoDTO } from "../types/plano.types";

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
    private readonly perfilMapper;
    private readonly fichaMapper;

    constructor(
        prismaClient: PrismaClient,
        perfilMapper: PerfilMapper,
        fichaMapper: FichaMapper,
    ) {
        this.prismaClient = prismaClient;
        this.perfilMapper = perfilMapper;
        this.fichaMapper = fichaMapper;
    }

    buscarPorEmail(email: string) {
        return this.prismaClient.usuario.findUnique({ where: { email } });
    }

    /**
     * Só o hash da senha. Existe separado de `buscarPerfilCompleto` porque um
     * `select` que traga o hash junto de dados de tela é um convite a vazá-lo
     * numa resposta por descuido.
     */
    async buscarSenhaHash(usuarioId: string): Promise<string | null> {
        const usuario = await this.prismaClient.usuario.findUnique({
            where: { id: usuarioId },
            select: { senhaHash: true },
        });

        return usuario?.senhaHash ?? null;
    }

    /**
     * Apaga a conta e tudo que pende dela (RF35, LGPD).
     *
     * Uma linha só: todas as relações de `Usuario` declaram
     * `onDelete: Cascade`, então peso, restrições, fichas, sessões, exercícios,
     * refeições, itens, hidratação, refeições marcadas, treinos, séries e cargas
     * saem junto, no mesmo comando. Apagar tabela por tabela aqui reproduziria
     * essa lista no código, e ela ficaria desatualizada na próxima tabela nova.
     */
    async excluir(usuarioId: string): Promise<void> {
        await this.prismaClient.usuario.delete({ where: { id: usuarioId } });
    }

    /**
     * O perfil inteiro para a tela de edição — os dados pessoais, os físicos e
     * as restrições.
     *
     * Separado de `PesoRepository.buscarPerfil`, que traz só o recorte que o
     * MOTOR consome: aqui entram nome, sobrenome e as restrições, que a tela
     * precisa exibir e o motor não usa.
     */
    buscarPerfilCompleto(usuarioId: string) {
        return this.prismaClient.usuario.findUnique({
            where: { id: usuarioId },
            select: {
                nome: true,
                sobrenome: true,
                sexo: true,
                dataNascimento: true,
                alturaCm: true,
                percentualGordura: true,
                nivelAtividade: true,
                nivelExperiencia: true,
                objetivo: true,
                diasPorSemana: true,
                numeroRefeicoes: true,
                restricoes: { select: { tipo: true, descricao: true } },
            },
        });
    }

    /**
     * Atualiza o perfil e, quando as restrições vierem, as substitui inteiras.
     *
     * Substituir (apagar todas e recriar) em vez de fazer o diff: a lista é
     * curta, vem completa da tela, e um diff exigiria comparar por descrição —
     * que é justamente o campo que o usuário edita. Tudo na mesma transação,
     * senão uma falha no meio deixaria o usuário sem restrição nenhuma, que é o
     * estado perigoso.
     */
    async atualizarPerfil(
        usuarioId: string,
        dados: Prisma.UsuarioUpdateInput,
        restricoes: { tipo: TipoRestricao; descricao: string }[] | null,
    ): Promise<void> {
        const operacoes: Prisma.PrismaPromise<unknown>[] = [
            this.prismaClient.usuario.update({ where: { id: usuarioId }, data: dados }),
        ];

        if (restricoes) {
            operacoes.push(
                this.prismaClient.restricao.deleteMany({ where: { usuarioId } }),
                this.prismaClient.restricao.createMany({
                    data: restricoes.map((r) => ({ ...r, usuarioId })),
                }),
            );
        }

        await this.prismaClient.$transaction(operacoes);
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
                // O service já recusou o payload sem aceite; aqui o instante é
                // registrado, que é o que serve de prova.
                aceiteTermosEm: new Date(),

                sexo: perfil.sexo as Sexo,
                dataNascimento: new Date(perfil.dataNascimento),
                alturaCm: perfil.altura,
                percentualGordura: perfil.percentualGordura,
                nivelAtividade: this.perfilMapper.nivelAtividade(perfil.nivelAtividade),
                nivelExperiencia: this.perfilMapper.nivelExperiencia(perfil.nivelExperiencia),
                objetivo: this.perfilMapper.objetivo(perfil.objetivo),
                diasPorSemana: perfil.diasPorSemana,
                numeroRefeicoes: perfil.numeroRefeicoes,

                // O peso informado no onboarding é o primeiro ponto do histórico.
                pesos: { create: [{ pesoKg: perfil.peso }] },

                restricoes: { create: restricoes },

                // A montagem das duas fichas vive no FichaMapper porque a
                // regeneração do plano (RF20) precisa exatamente dela, com o
                // usuário já existindo — duas cópias divergiriam.
                fichasTreino: { create: [this.fichaMapper.treino(plano, resultado)] },
                fichasAlimentacao: {
                    create: [this.fichaMapper.alimentacao(plano, resultado)],
                },
            },
        });
    }
}
