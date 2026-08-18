import ValidationError from "../errors/ValidationError";
import { GeradorDePlano, OnboardingRequest, PlanoDTO } from "../types/plano.types";
import CalculoService from "./CalculoService";
import PlanoMapper from "./PlanoMapper";

/**
 * Orquestra o cadastro que chega do app (POST /api/onboarding, via
 * OnboardingController): valida se há perfil, calcula os números
 * (CalculoService), manda montar treino e dieta e converte o resultado no
 * formato que o app consome (PlanoMapper).
 *
 * Devolve o plano na resposta HTTP e também o imprime no console. Nada é
 * persistido ainda — o app guarda o plano em memória.
 */
export default class OnboardingService {
    private readonly calculoService;
    private readonly geradorDePlano;
    private readonly planoMapper;

    constructor(
        calculoService: CalculoService,
        geradorDePlano: GeradorDePlano,
        planoMapper: PlanoMapper,
    ) {
        this.calculoService = calculoService;
        this.geradorDePlano = geradorDePlano;
        this.planoMapper = planoMapper;
    }

    async receberCadastro(cadastro: OnboardingRequest): Promise<{ plano: PlanoDTO }> {
        if (!cadastro.perfil) {
            throw new ValidationError("perfil é obrigatório para gerar o plano");
        }

        const resultado = this.calculoService.calcular(cadastro.perfil);

        console.log("[onboarding] plano calculado:", JSON.stringify(resultado, null, 2));

        const { plano, validacao } = await this.geradorDePlano.gerar(cadastro.perfil, resultado);

        console.log("[onboarding] conferência dos macros:", JSON.stringify(validacao, null, 2));

        const planoDTO = this.planoMapper.montar(plano, resultado);

        console.log("[onboarding] plano enviado ao app:", JSON.stringify(planoDTO, null, 2));

        return { plano: planoDTO };
    }
}
