import ConflitoError from "../errors/ConflitoError";
import ValidationError from "../errors/ValidationError";
import UserRepository from "../repositories/user.repository";
import { CadastroRequest } from "../types/plano.types";
import AuthService from "./auth.service";
import EngineService from "./engine.service";

/**
 * Grava o cadastro quando o usuário aceita o plano na tela de revisão.
 *
 * Recebe o cadastro inteiro numa chamada só — conta, perfil e plano — porque
 * ainda não há autenticação: é o próprio payload que diz quem está sendo
 * criado. Nada é gravado antes desta confirmação.
 *
 * Os NÚMEROS do plano são recalculados aqui a partir do perfil, em vez de
 * virem no payload: o EngineService é determinístico, então o resultado é
 * idêntico ao que gerou o plano, e o DTO não precisa carregar campos que a
 * tela nem usa (tmb, tdee, frequência semanal, macros por refeição).
 *
 * Já a SELEÇÃO de alimentos e exercícios vem do payload — essa parte é escolha
 * da IA e regenerar daria um plano diferente do que o usuário aprovou.
 */
export default class CadastroService {
    private readonly userRepository;
    private readonly engineService;
    private readonly authService;

    constructor(
        userRepository: UserRepository,
        engineService: EngineService,
        authService: AuthService,
    ) {
        this.userRepository = userRepository;
        this.engineService = engineService;
        this.authService = authService;
    }

    async cadastrar(entrada: CadastroRequest): Promise<{ usuarioId: string }> {
        const { conta, perfil, plano } = entrada;

        if (!perfil) {
            throw new ValidationError("perfil é obrigatório para criar o cadastro");
        }

        if (!plano?.treino?.sessoes?.length || !plano?.dieta?.refeicoes?.length) {
            throw new ValidationError("plano precisa ter treino e dieta");
        }

        if (await this.userRepository.buscarPorEmail(conta.email)) {
            throw new ConflitoError("Já existe uma conta com este e-mail");
        }

        // Lança ValidationError se o perfil for inválido — antes de gravar nada.
        const resultado = this.engineService.calcular(perfil);
        const senhaHash = await this.authService.gerarHash(conta.senha);

        const usuario = await this.userRepository.criar({
            conta,
            perfil,
            plano,
            resultado,
            senhaHash,
        });

        console.log(`[cadastro] usuário criado: ${usuario.id} (${conta.email})`);

        return { usuarioId: usuario.id };
    }
}
