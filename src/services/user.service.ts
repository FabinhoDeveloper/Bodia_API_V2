import ConflitoError from "../errors/conflito.error";
import NaoEncontradoError from "../errors/nao-encontrado.error";
import ValidationError from "../errors/validation.error";
import PerfilMapper from "../mappers/perfil.mapper";
import PesoRepository from "../repositories/peso.repository";
import PlanRepository from "../repositories/plan.repository";
import UserRepository from "../repositories/user.repository";
import { SessaoIniciada } from "../types/auth.types";
import {
    ContaInput,
    NivelAtividade,
    NivelExperiencia,
    Objetivo,
    PerfilAtualizado,
    PerfilUpdateInput,
    ResumoPeso,
    Sexo,
} from "../types/perfil.types";
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

    /**
     * Faixa aceita no registro de peso.
     *
     * Não é uma opinião sobre o corpo de ninguém: é o intervalo fora do qual o
     * valor certamente é erro de digitação — 7 kg em vez de 70, 800 em vez de 80.
     * Um peso errado propaga para TMB, meta calórica, macros e hidratação de uma
     * vez só, então recusá-lo aqui é mais barato que corrigir depois.
     */
    private static readonly PESO_MIN_KG = 25;
    private static readonly PESO_MAX_KG = 400;

    /** Quantos pontos do histórico a tela de peso mostra. */
    private static readonly HISTORICO_PESO = 60;

    /**
     * Os campos do perfil que entram em alguma fórmula (RN12).
     *
     * A lista é explícita, e não "tudo menos as restrições": um campo novo
     * entra aqui por decisão, e não por esquecimento — errar para o lado de não
     * recalcular deixaria a meta calórica em silêncio desatualizada.
     */
    private static readonly CAMPOS_DE_CALCULO = [
        "sexo",
        "dataNascimento",
        "altura",
        "percentualGordura",
        "nivelAtividade",
        "nivelExperiencia",
        "objetivo",
        "diasPorSemana",
        "numeroRefeicoes",
    ] as const;

    private static readonly ATIVIDADES: NivelAtividade[] = [
        "sedentario",
        "leve",
        "moderado",
        "intenso",
        "atleta",
    ];
    private static readonly EXPERIENCIAS: NivelExperiencia[] = [
        "iniciante",
        "intermediario",
        "avancado",
    ];
    private static readonly OBJETIVOS: Objetivo[] = ["perder", "manter", "ganhar"];

    private static readonly ALTURA_MIN_CM = 100;
    private static readonly ALTURA_MAX_CM = 250;

    private readonly userRepository;
    private readonly engineService;
    private readonly authService;
    private readonly pesoRepository;
    private readonly planRepository;
    private readonly perfilMapper;

    constructor(
        userRepository: UserRepository,
        engineService: EngineService,
        authService: AuthService,
        pesoRepository: PesoRepository,
        planRepository: PlanRepository,
        perfilMapper: PerfilMapper,
    ) {
        this.userRepository = userRepository;
        this.engineService = engineService;
        this.authService = authService;
        this.pesoRepository = pesoRepository;
        this.planRepository = planRepository;
        this.perfilMapper = perfilMapper;
    }

    /**
     * Registra um peso novo e recalcula as metas na sequência (RF33 + RF34).
     *
     * As duas coisas na mesma chamada porque o RF34 diz "ao registrar novo
     * peso": separá-las abriria a janela em que o peso já mudou e a meta
     * calórica ainda é a de antes.
     *
     * Um peso por vez, sem restrição de um por dia: pesar-se duas vezes no mesmo
     * dia é legítimo, e o mais recente vence.
     */
    async registrarPeso(usuarioId: string, pesoKg: number): Promise<ResumoPeso> {
        if (
            typeof pesoKg !== "number" ||
            !Number.isFinite(pesoKg) ||
            pesoKg < UserService.PESO_MIN_KG ||
            pesoKg > UserService.PESO_MAX_KG
        ) {
            throw new ValidationError(
                `pesoKg deve estar entre ${UserService.PESO_MIN_KG} e ${UserService.PESO_MAX_KG}`,
            );
        }

        await this.pesoRepository.criar(usuarioId, pesoKg);

        return this.recalcular(usuarioId);
    }

    /** O perfil como a tela de edição o exibe (RF10 / UC06 passo 2). */
    async consultarPerfil(usuarioId: string): Promise<PerfilAtualizado["perfil"]> {
        const usuario = await this.userRepository.buscarPerfilCompleto(usuarioId);

        if (!usuario) {
            throw new NaoEncontradoError("Usuário não encontrado");
        }

        return this.perfilDoBanco(usuario);
    }

    /**
     * Atualiza o perfil e recalcula quando algum campo de cálculo mudou
     * (RF10 + RN12).
     *
     * O recálculo é CONDICIONAL, e não incondicional: o FA02 do UC06 é
     * exatamente o caso de quem mexeu só nas restrições, que não entram em
     * fórmula nenhuma. Anunciar "metas atualizadas" quando nada mudou treinaria
     * o usuário a ignorar o aviso.
     *
     * O peso não entra aqui: tem rota própria, porque é um evento com histórico
     * e não um campo que se sobrescreve.
     */
    async atualizarPerfil(
        usuarioId: string,
        entrada: PerfilUpdateInput,
    ): Promise<PerfilAtualizado> {
        const atual = await this.userRepository.buscarPerfilCompleto(usuarioId);

        if (!atual) {
            throw new NaoEncontradoError("Usuário não encontrado");
        }

        const dados = this.validarPerfil(entrada);
        const restricoes = this.restricoesDe(entrada);

        await this.userRepository.atualizarPerfil(usuarioId, dados, restricoes);

        // RN12: só estes campos entram nas fórmulas. `dataNascimento` entra pela
        // idade, e `diasPorSemana`/`numeroRefeicoes` pelo treino e pela divisão
        // das refeições.
        const afetaCalculo = UserService.CAMPOS_DE_CALCULO.some(
            (campo) => entrada[campo] !== undefined,
        );

        const perfil = this.perfilDoBanco(
            (await this.userRepository.buscarPerfilCompleto(usuarioId))!,
        );

        if (!afetaCalculo) {
            return { perfil, recalculado: false, metas: null, planoDesatualizado: false };
        }

        // RN13: o recálculo passa pelo mesmo motor, com os mesmos limites de
        // segurança — não há um caminho "de atualização" com regras próprias.
        const { metas, planoDesatualizado } = await this.recalcular(usuarioId);

        return { perfil, recalculado: true, metas, planoDesatualizado };
    }

    /** O histórico e as metas vigentes, sem gravar nada. */
    async consultarPeso(usuarioId: string): Promise<ResumoPeso> {
        const perfil = await this.pesoRepository.buscarPerfil(usuarioId);

        if (!perfil) {
            throw new NaoEncontradoError("Usuário não encontrado");
        }

        const historico = await this.pesoRepository.listar(
            usuarioId,
            UserService.HISTORICO_PESO,
        );

        // Sem peso nenhum não há o que recalcular — só acontece se o histórico
        // for apagado, já que o cadastro grava o primeiro ponto.
        if (!perfil.pesos[0]) {
            return { historico, metas: null, planoDesatualizado: false };
        }

        const resultado = this.engineService.calcular(
            this.perfilMapper.paraMotor(perfil, perfil.pesos[0].pesoKg),
        );

        return { historico, metas: this.metasDe(resultado), planoDesatualizado: false };
    }

    /**
     * Recalcula TMB, GET, meta calórica, macros e hidratação a partir do peso
     * mais recente, e grava as metas novas na ficha ativa (RF34).
     *
     * Só as METAS são atualizadas. As refeições prescritas continuam as da ficha
     * antiga, montadas para a meta anterior — por isso `planoDesatualizado`: a
     * decisão de trocar o cardápio inteiro é do usuário (RF20), não um efeito
     * colateral de subir na balança.
     */
    private async recalcular(usuarioId: string): Promise<ResumoPeso> {
        const perfil = await this.pesoRepository.buscarPerfil(usuarioId);

        if (!perfil?.pesos[0]) {
            throw new NaoEncontradoError("Usuário não encontrado");
        }

        const resultado = this.engineService.calcular(
            this.perfilMapper.paraMotor(perfil, perfil.pesos[0].pesoKg),
        );
        const metas = this.metasDe(resultado);

        const tinhaFicha = await this.planRepository.atualizarMetasDaFichaAtiva(
            usuarioId,
            metas,
        );

        const historico = await this.pesoRepository.listar(
            usuarioId,
            UserService.HISTORICO_PESO,
        );

        console.log(
            `[peso] ${usuarioId}: ${perfil.pesos[0].pesoKg} kg -> ${metas.caloriasAlvo} kcal`,
        );

        return { historico, metas, planoDesatualizado: tinhaFicha };
    }

    /**
     * Confere os campos enviados e devolve só os que vieram, já no vocabulário
     * do banco.
     *
     * Campo ausente é campo NÃO ALTERADO — daí o `undefined` filtrado em vez de
     * gravado. Sem essa distinção, mandar `{ objetivo: "ganhar" }` apagaria
     * altura, nível de atividade e todo o resto do perfil.
     */
    private validarPerfil(entrada: PerfilUpdateInput) {
        const dados: Record<string, unknown> = {};

        if (entrada.nome !== undefined) {
            if (String(entrada.nome).trim().length < UserService.NOME_MIN) {
                throw new ValidationError("nome é obrigatório");
            }
            dados.nome = String(entrada.nome).trim();
        }

        if (entrada.sobrenome !== undefined) {
            if (String(entrada.sobrenome).trim().length < UserService.NOME_MIN) {
                throw new ValidationError("sobrenome é obrigatório");
            }
            dados.sobrenome = String(entrada.sobrenome).trim();
        }

        if (entrada.sexo !== undefined) {
            if (entrada.sexo !== "M" && entrada.sexo !== "F") {
                throw new ValidationError("sexo deve ser M ou F");
            }
            dados.sexo = entrada.sexo;
        }

        if (entrada.dataNascimento !== undefined) {
            const nascimento = new Date(entrada.dataNascimento);

            if (Number.isNaN(nascimento.getTime()) || nascimento > new Date()) {
                throw new ValidationError("dataNascimento inválida");
            }
            dados.dataNascimento = nascimento;
        }

        if (entrada.altura !== undefined) {
            if (
                typeof entrada.altura !== "number" ||
                entrada.altura < UserService.ALTURA_MIN_CM ||
                entrada.altura > UserService.ALTURA_MAX_CM
            ) {
                throw new ValidationError(
                    `altura deve estar entre ${UserService.ALTURA_MIN_CM} e ${UserService.ALTURA_MAX_CM} cm`,
                );
            }
            dados.alturaCm = entrada.altura;
        }

        if (entrada.percentualGordura !== undefined) {
            const percentual = entrada.percentualGordura;

            // Nulo é legítimo: o campo é opcional no onboarding, e limpá-lo
            // precisa ser possível.
            if (percentual !== null && (typeof percentual !== "number" || percentual < 1 || percentual > 70)) {
                throw new ValidationError("percentualGordura deve estar entre 1 e 70");
            }
            dados.percentualGordura = percentual;
        }

        if (entrada.nivelAtividade !== undefined) {
            this.exigirOpcao(entrada.nivelAtividade, UserService.ATIVIDADES, "nivelAtividade");
            dados.nivelAtividade = this.perfilMapper.nivelAtividade(entrada.nivelAtividade);
        }

        if (entrada.nivelExperiencia !== undefined) {
            this.exigirOpcao(
                entrada.nivelExperiencia,
                UserService.EXPERIENCIAS,
                "nivelExperiencia",
            );
            dados.nivelExperiencia = this.perfilMapper.nivelExperiencia(
                entrada.nivelExperiencia,
            );
        }

        if (entrada.objetivo !== undefined) {
            this.exigirOpcao(entrada.objetivo, UserService.OBJETIVOS, "objetivo");
            dados.objetivo = this.perfilMapper.objetivo(entrada.objetivo);
        }

        // As mesmas faixas que o EngineService exige — os splits só existem de 2
        // a 6 dias, e a tabela de distribuição só cobre de 3 a 6 refeições.
        if (entrada.diasPorSemana !== undefined) {
            if (
                !Number.isInteger(entrada.diasPorSemana) ||
                entrada.diasPorSemana < 2 ||
                entrada.diasPorSemana > 6
            ) {
                throw new ValidationError("diasPorSemana deve ser um inteiro entre 2 e 6");
            }
            dados.diasPorSemana = entrada.diasPorSemana;
        }

        if (entrada.numeroRefeicoes !== undefined) {
            if (
                !Number.isInteger(entrada.numeroRefeicoes) ||
                entrada.numeroRefeicoes < 3 ||
                entrada.numeroRefeicoes > 6
            ) {
                throw new ValidationError("numeroRefeicoes deve ser um inteiro entre 3 e 6");
            }
            dados.numeroRefeicoes = entrada.numeroRefeicoes;
        }

        return dados;
    }

    private exigirOpcao(valor: string, aceitos: readonly string[], campo: string): void {
        if (!aceitos.includes(valor)) {
            throw new ValidationError(`${campo} deve ser um de: ${aceitos.join(", ")}`);
        }
    }

    /**
     * As restrições no formato do banco, ou `null` quando nenhuma das duas
     * listas veio.
     *
     * `null` e lista vazia significam coisas diferentes: a primeira é "não
     * mexi", a segunda é "apaguei todas". Tratá-las igual impediria o usuário de
     * remover a última restrição.
     */
    private restricoesDe(entrada: PerfilUpdateInput) {
        const { restricoesAlimentares, restricoesFisicas } = entrada;

        if (restricoesAlimentares === undefined && restricoesFisicas === undefined) {
            return null;
        }

        return [
            ...(restricoesAlimentares ?? []).map((descricao) => ({
                tipo: "ALIMENTAR" as const,
                descricao,
            })),
            ...(restricoesFisicas ?? []).map((descricao) => ({
                tipo: "FISICA" as const,
                descricao,
            })),
        ];
    }

    /** O usuário gravado, no vocabulário da API que a tela consome. */
    private perfilDoBanco(
        usuario: NonNullable<
            Awaited<ReturnType<UserRepository["buscarPerfilCompleto"]>>
        >,
    ): PerfilAtualizado["perfil"] {
        const paraMotor = this.perfilMapper.paraMotor(usuario, 0);

        return {
            nome: usuario.nome,
            sobrenome: usuario.sobrenome,
            sexo: usuario.sexo as Sexo,
            dataNascimento: paraMotor.dataNascimento,
            alturaCm: usuario.alturaCm,
            percentualGordura: usuario.percentualGordura,
            nivelAtividade: paraMotor.nivelAtividade,
            nivelExperiencia: paraMotor.nivelExperiencia,
            objetivo: paraMotor.objetivo,
            diasPorSemana: usuario.diasPorSemana,
            numeroRefeicoes: usuario.numeroRefeicoes,
            restricoesAlimentares: usuario.restricoes
                .filter((r) => r.tipo === "ALIMENTAR")
                .map((r) => r.descricao),
            restricoesFisicas: usuario.restricoes
                .filter((r) => r.tipo === "FISICA")
                .map((r) => r.descricao),
        };
    }

    /** O recorte do ResultadoCalculo que a FichaAlimentacao guarda. */
    private metasDe(resultado: ReturnType<EngineService["calcular"]>) {
        return {
            tmb: resultado.metabolismo.tmb,
            tdee: resultado.metabolismo.tdee,
            caloriasAlvo: resultado.meta.caloriasAlvo,
            proteinaG: resultado.macros.proteina.g,
            carboidratoG: resultado.macros.carboidrato.g,
            gorduraG: resultado.macros.gordura.g,
            metaAguaMl: resultado.dieta.metaAguaMl,
        };
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

        // RF36: o aceite é OBRIGATÓRIO, e conferido aqui e não só no app — a
        // tela pode ser contornada, a rota não. `!== true` recusa também o
        // "true" em texto e o 1, que passariam num teste de veracidade frouxo.
        if (conta.aceiteTermos !== true) {
            throw new ValidationError(
                "é necessário aceitar o aviso legal e a política de privacidade",
            );
        }
    }
}
