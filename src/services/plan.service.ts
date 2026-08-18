import NaoEncontradoError from "../errors/NaoEncontradoError";
import ValidationError from "../errors/ValidationError";
import MeuPlanoMapper from "../mappers/meu-plano.mapper";
import PlanoMapper from "../mappers/plano.mapper";
import PlanRepository from "../repositories/plan.repository";
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
 * `consultar` (GET /api/plano/:usuarioId) lê o plano já gravado e o devolve no
 * formato das telas principais.
 */
export default class PlanService {
    private readonly engineService;
    private readonly geradorDePlano;
    private readonly planoMapper;
    private readonly planRepository;
    private readonly meuPlanoMapper;

    constructor(
        engineService: EngineService,
        geradorDePlano: GeradorDePlano,
        planoMapper: PlanoMapper,
        planRepository: PlanRepository,
        meuPlanoMapper: MeuPlanoMapper,
    ) {
        this.engineService = engineService;
        this.geradorDePlano = geradorDePlano;
        this.planoMapper = planoMapper;
        this.planRepository = planRepository;
        this.meuPlanoMapper = meuPlanoMapper;
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
