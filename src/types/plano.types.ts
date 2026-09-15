/**
 * Tipos do plano, nos três formatos por que ele passa:
 *
 *   PlanoGerado  — o que o gerador (IA ou fixture) devolve: só a SELEÇÃO de
 *                  itens, sem número calculado.
 *   PlanoDTO     — o que a API devolve ao app no onboarding: a seleção já
 *                  cruzada com os números do motor e com os catálogos.
 *   MeuPlano     — o que a API devolve ao app depois de persistido, lido do
 *                  banco (GET /api/plano/:usuarioId).
 */

import {
    ContaInput,
    PerfilOnboardingInput,
    PerfilParaPlano,
    ResultadoCalculo,
} from "./perfil.types";

// ---------------------------------------------------------------------------
// Plano cru, como sai do gerador
// ---------------------------------------------------------------------------

export interface ItemRefeicao {
    alimentoId: number;
    nome: string;
    gramas: number;
}

export interface Refeicao {
    nome: string;
    itens: ItemRefeicao[];
}

export interface ExercicioPrescrito {
    exercicioId: number;
    nome: string;
    series: number;
    repeticoes: string;
}

export interface SessaoTreino {
    nome: string;
    exercicios: ExercicioPrescrito[];
}

export interface PlanoGerado {
    dieta: { refeicoes: Refeicao[] };
    treino: { sessoes: SessaoTreino[] };
    observacoes?: string;
}

/**
 * Saída da CHAMADA 1 da dieta: só a seleção, sem gramas.
 *
 * Existe como tipo próprio porque é um estado intermediário real — o plano
 * ainda não é montável a partir dele. O `PorcoesSolver` recebe estes ids e
 * resolve as porções; só então nasce um `Refeicao`.
 */
export interface SelecaoDieta {
    refeicoes: { nome: string; alimentoIds: number[] }[];
}

/**
 * Uma refeição que fechou fora da tolerância de macros, e o que pedir ao modelo
 * para consertá-la — em linguagem de COMIDA, não de aritmética.
 *
 * Quem mede e escreve é o `AjusteSelecao`; quem pede a refeição de novo é o
 * `DietaIaGenerator`. Por isso o tipo mora aqui, e não num dos dois.
 */
export interface CorrecaoRefeicao {
    refeicao: string;
    instrucao: string;
}

// ---------------------------------------------------------------------------
// Conferência dos macros — o número do gerador nunca é aceito na palavra dele
// ---------------------------------------------------------------------------

export interface DesvioMacro {
    meta: number;
    obtido: number;
    desvioPercentual: number;
}

export interface Validacao {
    calorias: DesvioMacro;
    proteina: DesvioMacro;
    carboidrato: DesvioMacro;
    gordura: DesvioMacro;
    dentroDoLimite: boolean;
}

/** Desvio de UM grupo muscular: o que foi prescrito contra o que a IA montou. */
export interface DesvioGrupo {
    grupo: string;
    /** Séries por sessão que o orçamento pediu. */
    prescrito: number;
    /** Séries por sessão que os exercícios escolhidos somam. */
    obtido: number;
    desvioSeries: number;
}

/** Conferência do volume de UMA sessão. */
export interface ValidacaoSessao {
    sessao: string;
    grupos: DesvioGrupo[];
    /** Exercícios além do orçamento, em grupo que não foi prescrito. */
    gruposForaDoOrcamento: string[];
    quantidadeExercicios: number;
    dentroDoLimite: boolean;
}

export interface ValidacaoVolume {
    sessoes: ValidacaoSessao[];
    dentroDoLimite: boolean;
}

export interface PlanoValidado {
    plano: PlanoGerado;
    validacao: Validacao;
    /**
     * Quantas vezes o plano foi gerado — 1 quando fechou de primeira. É o
     * número de tentativas FEITAS, não a que venceu: o que ele mede é o custo
     * em chamadas e em tempo. Existe para MEDIR o retry, e é essa medição que
     * decide o que fazer com o RNF02 (geração em até 15 s).
     */
    tentativas?: number;
    /**
     * O que o gerador não conseguiu consertar, uma linha por refeição — vazio no
     * caso normal.
     *
     * Existe porque a seleção defeituosa deixou de abortar a geração: uma
     * refeição que o modelo não soube montar nem depois dos reparos é ENTREGUE,
     * e o problema precisa viajar junto dela em vez de sumir. É a mesma política
     * do `PorcoesSolver` para meta inalcançável — o desvio é reportado, não
     * escondido.
     */
    avisos?: string[];
    /**
     * Conferência do volume de treino. Existe pela mesma razão que `validacao`:
     * o número que a IA devolveu nunca é aceito na palavra dela. Até então a
     * dieta tinha validador e o treino não tinha nenhum.
     */
    validacaoVolume: ValidacaoVolume;
}

// ---------------------------------------------------------------------------
// PlanoDTO — o contrato do POST /api/onboarding
// ---------------------------------------------------------------------------

export interface ItemRefeicaoDTO {
    alimentoId: number;
    nome: string;
    gramas: number;
    kcal: number;
}

export interface RefeicaoDTO {
    nome: string;
    horario: string;
    kcal: number;
    itens: ItemRefeicaoDTO[];
}

export interface ExercicioDTO {
    exercicioId: number;
    nome: string;
    grupoMuscular: string;
    series: number;
    repeticoes: string;
    descansoSegundos: number;
}

export interface SessaoTreinoDTO {
    nome: string;
    /**
     * Todos os dias em que esta sessão acontece — Upper 2x/semana vira
     * ["Segunda", "Quinta"].
     *
     * É lista, e não um dia só, porque a prescrição continua sendo UMA sessão
     * repetida. Duplicar a sessão para ter um dia em cada gravaria duas linhas
     * de SessaoTreino no banco e deixaria ambíguo qual das duas o usuário
     * registrou ao treinar.
     */
    diasSemana: string[];
    gruposMusculares: string;
    exercicios: ExercicioDTO[];
}

export interface PlanoDTO {
    metas: {
        calorias: number;
        proteinaG: number;
        carboidratoG: number;
        gorduraG: number;
        aguaMl: number;
    };
    treino: {
        split: string;
        diasPorSemana: number;
        sessoes: SessaoTreinoDTO[];
    };
    dieta: {
        refeicoes: RefeicaoDTO[];
    };
    observacoes?: string;
}

/**
 * A conferência do plano, no formato que o app exibe (RF22).
 *
 * Vai JUNTO da resposta do onboarding, mas FORA do `PlanoDTO`: o PlanoDTO é
 * devolvido ao servidor no cadastro, e mandar de volta a conferência que o
 * próprio servidor produziu não teria propósito nenhum.
 *
 * Existe porque medir o desvio sem mostrá-lo não fecha o RF22: até então os dois
 * validadores recalculavam tudo corretamente e o resultado ia só para o
 * `console.log` do servidor — ninguém do lado do usuário via.
 *
 * A correção automática por reenvio ao modelo existe — os dois laços de retry,
 * o do plano e o da refeição. O que chega aqui é o que sobrou DEPOIS deles: o
 * desvio residual em `macros`/`volume` e, em `avisos`, a refeição que nem o
 * reparo resolveu.
 */
export interface ConferenciaDTO {
    /** Os dois validadores dentro do limite. */
    dentroDoLimite: boolean;
    /** Contra o que o desvio dos macros está sendo medido, em pontos percentuais. */
    toleranciaPercentual: number;
    macros: {
        /** "Calorias", "Proteína", ... — pronto para a tela. */
        nome: string;
        /** Unidade do valor: "kcal" ou "g". */
        unidade: string;
        meta: number;
        obtido: number;
        desvioPercentual: number;
    }[];
    volume: {
        dentroDoLimite: boolean;
        /** Nomes das sessões cujo volume ficou fora do orçamento. */
        sessoesForaDoOrcamento: string[];
    };
    /**
     * Quantas vezes o plano foi gerado até chegar a este resultado — 1 quando
     * fechou de primeira, até 5 quando o gerador precisou pedir de novo.
     *
     * Sobe até o app de propósito: é o que permite MEDIR com que frequência o
     * retry dispara em uso real, sem depender de ler log de servidor. É essa
     * medição que decide o que fazer com o RNF02 (geração em até 15 s).
     */
    tentativas: number;
    /**
     * As refeições que ficaram defeituosas depois de esgotados os reparos —
     * "Almoço: sem nenhuma fonte de proteína". Vazio no caso normal.
     *
     * Sobe até o app pela mesma razão que o desvio dos macros (RF22): antes
     * disso, um almoço sem proteína virava um 500 e o usuário não recebia plano
     * nenhum. Agora ele recebe o plano E o motivo da imperfeição, e é ele quem
     * decide se aceita.
     */
    avisos: string[];
}

/** O que o POST /api/onboarding devolve. */
export interface OnboardingResponse {
    plano: PlanoDTO;
    conferencia: ConferenciaDTO;
}

/**
 * O que o POST /api/plano/regenerar devolve.
 *
 * Mesmo par do onboarding, e pela mesma razão (RF22): o desvio medido pelos
 * validadores acompanha o plano em vez de morrer no log do servidor. Antes só o
 * onboarding o recebia, e quem gerava plano novo pelo Perfil não via nada.
 *
 * `plano` é o formato das TELAS (MeuPlano), e não o PlanoDTO do onboarding: aqui
 * o plano já está gravado, e é dele que saem os ids que o app usa para marcar
 * refeição e abrir treino.
 *
 * A conferência não entra em `MeuPlano` de propósito — o GET /api/plano lê do
 * banco, onde não há validação a refazer, e o campo nasceria sempre nulo.
 */
export interface RegeneracaoResponse {
    plano: MeuPlano;
    conferencia: ConferenciaDTO;
}

// ---------------------------------------------------------------------------
// MeuPlano — o contrato do GET /api/plano
// ---------------------------------------------------------------------------

export interface MeuPlano {
    usuario: {
        nome: string;
        sobrenome: string;
        email: string;
        alturaCm: number;
        objetivo: string;
        pesoAtualKg: number | null;
    };
    treino: {
        split: string;
        diasPorSemana: number;
        sessoes: {
            id: string;
            nome: string;
            diasSemana: string[];
            gruposMusculares: string;
            exercicios: {
                id: string;
                exercicioId: number;
                nome: string;
                grupoMuscular: string;
                series: number;
                repeticoes: string;
                descansoSegundos: number;
                ultimoPesoKg: number | null;
            }[];
        }[];
    };
    dieta: {
        metas: {
            calorias: number;
            proteinaG: number;
            carboidratoG: number;
            gorduraG: number;
            aguaMl: number;
        };
        refeicoes: {
            id: string;
            nome: string;
            horario: string;
            kcal: number;
            proteinaG: number;
            carboidratoG: number;
            gorduraG: number;
            itens: { alimentoId: number; nome: string; gramas: number; kcal: number }[];
        }[];
    };
    /**
     * O plano que o usuário mandou gerar e que ainda não entrou em vigor
     * (RF20). `vigenteDe` é o dia local em "AAAA-MM-DD" — o mesmo formato de
     * `ResumoRefeicoesDia.dia`. Nulo quando não há nada agendado.
     *
     * Fica no TOPO, e não dentro de `dieta`, porque um plano é gerado inteiro:
     * o treino e a dieta agendados entram em vigor no mesmo instante.
     *
     * É só a DATA, e não a prescrição de amanhã: a tela só precisa saber que
     * existe algo a caminho para explicar por que o cardápio de hoje não mudou.
     */
    planoAgendado: { vigenteDe: string } | null;
}

// ---------------------------------------------------------------------------
// Payloads das duas rotas de cadastro
// ---------------------------------------------------------------------------

/**
 * Corpo do POST /api/onboarding. Só gera o plano — nada é persistido aqui.
 *
 * Nome antigo: CadastroInput (em OnboardingService). Renomeado porque
 * CadastroService declarava OUTRA interface com o mesmo nome e um campo a
 * mais, o que tornava fácil trocar uma pela outra sem o tsc reclamar.
 */
export interface OnboardingRequest {
    conta: ContaInput;
    perfil: PerfilOnboardingInput | null;
}

/** Corpo do POST /api/cadastro: o onboarding mais o plano que o usuário aprovou. */
export interface CadastroRequest {
    conta: ContaInput;
    perfil: PerfilOnboardingInput | null;
    plano: PlanoDTO | null;
}

/** Contrato do gerador de plano: a IA e o fixture são intercambiáveis. */
export interface GeradorDePlano {
    gerar(perfil: PerfilParaPlano, resultado: ResultadoCalculo): Promise<PlanoValidado>;
}

