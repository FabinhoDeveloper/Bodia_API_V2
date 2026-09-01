import ConflitoError from "../errors/conflito.error";
import ValidationError from "../errors/validation.error";
import UserRepository from "../repositories/user.repository";
import { SessaoIniciada } from "../types/auth.types";
import { ContaInput } from "../types/perfil.types";
import { CadastroRequest } from "../types/plano.types";
import AuthService from "./auth.service";
import EngineService from "./engine.service";

/**
 * Grava o cadastro quando o usuário aceita o plano na tela de revisão.
 *
 * Recebe o cadastro inteiro numa chamada só — conta, perfil e plano — porque é
 * a requisição que CRIA a identidade: não há token para apresentar antes de a
 * conta existir. Nada é gravado antes desta confirmação, e é ela que devolve o
 * primeiro token da sessão.
 *
 * Os NÚMEROS do plano são recalculados aqui a partir do perfil, em vez de
 * virem no payload: o EngineService é determinístico, então o resultado é
 * idêntico ao que gerou o plano, e o DTO não precisa carregar campos que a
 * tela nem usa (tmb, tdee, frequência semanal, macros por refeição).
 *
 * Já a SELEÇÃO de alimentos e exercícios vem do payload — essa parte é escolha
 * da IA e regenerar daria um plano diferente do que o usuário aprovou.
 */
export default class UserService {
    /**
     * Deliberadamente frouxo: um `x@y.z` qualquer. Validar e-mail por regex é
     * problema sem solução exata (a gramática do RFC 5322 aceita coisas que
     * nenhum provedor emite), e uma regex estrita rejeita endereço legítimo —
     * erro pior que aceitar um inválido, que só falha na hora de usar.
     */
    private static readonly EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    private static readonly SENHA_MIN = 8;
    private static readonly NOME_MIN = 2;

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

    async cadastrar(entrada: CadastroRequest): Promise<SessaoIniciada> {
        const { conta, perfil, plano } = entrada;

        if (!perfil) {
            throw new ValidationError("perfil é obrigatório para criar o cadastro");
        }

        this.validarConta(conta);

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

        // Já sai autenticado: obrigar quem acabou de escolher a senha a digitá-la
        // de novo na tela seguinte seria atrito puro.
        return this.authService.abrirSessao(usuario);
    }

    /**
     * Confere a conta campo a campo, antes de qualquer consulta ao banco.
     *
     * Fica no service, e não numa pasta `validators/`, pelo mesmo motivo que
     * `EngineService.validarPerfil`: é regra de negócio do domínio, e uma camada
     * nova só para isto multiplicaria os lugares onde procurar uma regra.
     *
     * A senha é conferida por COMPRIMENTO, não por composição obrigatória
     * (maiúscula, dígito, símbolo). Regras de composição empurram o usuário para
     * a senha mais curta que passa — "Senha1!" — enquanto o comprimento é o que
     * de fato cresce o espaço de busca.
     */
    private validarConta(conta: ContaInput | undefined): void {
        if (!conta) {
            throw new ValidationError("conta é obrigatória para criar o cadastro");
        }

        const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

        if (texto(conta.nome).length < UserService.NOME_MIN) {
            throw new ValidationError("nome é obrigatório");
        }

        if (texto(conta.sobrenome).length < UserService.NOME_MIN) {
            throw new ValidationError("sobrenome é obrigatório");
        }

        if (!UserService.EMAIL.test(texto(conta.email))) {
            throw new ValidationError("e-mail inválido");
        }

        if (typeof conta.senha !== "string" || conta.senha.length < UserService.SENHA_MIN) {
            throw new ValidationError(
                `senha deve ter pelo menos ${UserService.SENHA_MIN} caracteres`,
            );
        }
    }
}
