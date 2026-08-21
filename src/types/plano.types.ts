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
 * ainda não é montável a partir dele. A chamada 2 recebe estes ids e devolve as
 * quantidades; só então nasce um `Refeicao`.
 */
export interface SelecaoDieta {
    refeicoes: { nome: string; alimentoIds: number[] }[];
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
    dia: string;
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

// ---------------------------------------------------------------------------
// MeuPlano — o contrato do GET /api/plano/:usuarioId
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
            diaSemana: string;
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

