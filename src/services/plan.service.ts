import NaoEncontradoError from "../errors/nao-encontrado.error";
import ValidationError from "../errors/validation.error";
import MeuPlanoMapper from "../mappers/meu-plano.mapper";
import PlanoMapper from "../mappers/plano.mapper";
import PerfilMapper from "../mappers/perfil.mapper";
import PesoRepository from "../repositories/peso.repository";
import PlanRepository from "../repositories/plan.repository";
import { PerfilOnboardingInput } from "../types/perfil.types";
import { GeradorDePlano, MeuPlano, OnboardingRequest, PlanoDTO } from "../types/plano.types";
import EngineService from "./engine.service";

/**
 * Domínio do plano: gerar e consultar.
 *
 * `gerar` (POST /api/onboarding) valida o perfil, calcula os números no
 * EngineService, manda montar treino e dieta e converte o resultado no formato
 * que o app consome. Quem monta o plano é o gerador injetado — a IA ou o
 * fixture, decidido na rota pela flag SIMULAR_IA; este service não sabe qual
 * dos dois recebeu.
 *
 * Nada é persistido aqui: o plano volta na resposta e o app o guarda até o
 * usuário aprovar, quando o user.service grava tudo de uma vez.
 *
 * `consultar` (GET /api/plano) lê o plano já gravado e o devolve no formato das
 * telas principais.
 *
 * `regenerar` (POST /api/plano/regenerar) é o caminho do RF20, e a diferença
 * para o `gerar` é que ali o usuário ainda não existe: aqui o perfil vem do
 * BANCO, e o plano é persistido na hora, sem passar por uma tela de aprovação.
 */
export default class PlanService {
    private readonly engineService;
    private readonly geradorDePlano;
    private readonly planoMapper;
    private readonly planRepository;
    private readonly meuPlanoMapper;
    private readonly pesoRepository;
    private readonly perfilMapper;

    constructor(
        engineService: EngineService,
        geradorDePlano: GeradorDePlano,
        planoMapper: PlanoMapper,
        planRepository: PlanRepository,
        meuPlanoMapper: MeuPlanoMapper,
        pesoRepository: PesoRepository,
        perfilMapper: PerfilMapper,
    ) {
        this.engineService = engineService;
        this.geradorDePlano = geradorDePlano;
        this.planoMapper = planoMapper;
        this.planRepository = planRepository;
        this.meuPlanoMapper = meuPlanoMapper;
        this.pesoRepository = pesoRepository;
        this.perfilMapper = perfilMapper;
    }

    async gerar(cadastro: OnboardingRequest): Promise<{ plano: PlanoDTO }> {
        if (!cadastro.perfil) {
            throw new ValidationError("perfil é obrigatório para gerar o plano");
        }

        const resultado = this.engineService.calcular(cadastro.perfil);

        console.log("[onboarding] plano calculado:", JSON.stringify(resultado, null, 2));

        const { plano, validacao } = await this.geradorDePlano.gerar(cadastro.perfil, resultado);

        console.log("[onboarding] conferência dos macros:", JSON.stringify(validacao, null, 2));

        const planoDTO = this.planoMapper.montar(plano, resultado);

        console.log("[onboarding] plano enviado ao app:", JSON.stringify(planoDTO, null, 2));

        return { plano: planoDTO };
    }

    /**
     * Gera um plano novo para quem já tem conta e o grava (RF20).
     *
     * O perfil vem do BANCO, e não do payload: o usuário autenticado não deveria
     * poder trocar o próprio sexo, altura ou objetivo por uma requisição cujo
     * propósito declarado é "quero outro cardápio". Mudar o perfil é o RF10, e
     * tem rota própria.
     *
     * O plano é persistido de imediato, sem tela de aprovação. No cadastro a
     * aprovação existe porque nada foi gravado ainda e desistir não deixa lixo;
     * aqui o usuário já tem plano, e um "gere, mas não guarde" só produziria uma
     * tela que ele teria de confirmar duas vezes.
     */
    async regenerar(usuarioId: string): Promise<MeuPlano> {
        const perfilBanco = await this.pesoRepository.buscarPerfil(usuarioId);

        if (!perfilBanco?.pesos[0]) {
            throw new NaoEncontradoError("Usuário não encontrado");
        }

        const restricoes = await this.planRepository.buscarRestricoes(usuarioId);

        const perfil: PerfilOnboardingInput = {
            ...this.perfilMapper.paraMotor(perfilBanco, perfilBanco.pesos[0].pesoKg),
            ...restricoes,
        };

        const resultado = this.engineService.calcular(perfil);
        const { plano, validacao } = await this.geradorDePlano.gerar(perfil, resultado);

        console.log("[regenerar] conferência dos macros:", JSON.stringify(validacao, null, 2));

        await this.planRepository.substituirFichas(
            usuarioId,
            this.planoMapper.montar(plano, resultado),
            resultado,
        );

        // Devolve o plano LIDO DO BANCO, e não o recém-montado: é o formato das
        // telas principais, com os ids que o app usa para marcar refeição e
        // abrir treino. Sem os ids, a tela abriria e nada seria clicável.
        return this.consultar(usuarioId);
    }

    async consultar(usuarioId: string): Promise<MeuPlano> {
        const usuario = await this.planRepository.buscarPlanoAtivo(usuarioId);

        if (!usuario) {
            throw new NaoEncontradoError("Usuário não encontrado");
        }

        const fichaTreino = usuario.fichasTreino[0];
        const fichaAlimentacao = usuario.fichasAlimentacao[0];

        if (!fichaTreino || !fichaAlimentacao) {
            throw new NaoEncontradoError("Usuário ainda não tem um plano ativo");
        }

        return this.meuPlanoMapper.montar(usuario, fichaTreino, fichaAlimentacao);
    }
}
