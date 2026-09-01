/**
 * Tipos dos registros do dia a dia — o que o usuário MARCA, em oposição ao que
 * foi prescrito para ele.
 *
 * A prescrição (ficha de treino, ficha de alimentação) já existe no schema e é
 * lida por PlanService.consultar. Hidratação, refeição e treino têm cada uma o
 * seu model e o seu par de tipos aqui.
 */

export interface RegistroRefeicao {
    id: string;
    usuarioId: string;
    /** FK para Refeicao (a refeição prescrita que foi cumprida). */
    refeicaoId: string;
    registradoEm: Date;
}

/**
 * O registro com a prescrição junto, como o repository o devolve.
 *
 * Os macros vêm do JOIN, não copiados na tabela de registro. É isso que mantém
 * a soma correta quando o usuário gera um plano novo no meio do dia: o registro
 * aponta para a Refeicao da ficha ANTIGA, que continua no banco (desativada,
 * nunca apagada) e ainda responde pelos seus macros.
 */
export interface RegistroRefeicaoComPrescricao extends RegistroRefeicao {
    refeicao: {
        nome: string;
        horario: string;
        kcal: number;
        proteinaG: number;
        carboidratoG: number;
        gorduraG: number;
    };
}

/** Os macros de um dia — a mesma forma para o consumido e para a meta. */
export interface Macros {
    kcal: number;
    proteinaG: number;
    carboidratoG: number;
    gorduraG: number;
}

/**
 * O contrato das três rotas de refeição — marcar, consultar e desmarcar
 * devolvem todas isto, no mesmo espírito de ResumoHidratacaoDia.
 *
 * NÃO existe um campo `refeicoesFeitas: string[]`: ele seria derivável de
 * `registros` e as duas cópias poderiam divergir. O app monta o conjunto com
 * `new Set(registros.map((r) => r.refeicaoId))`.
 *
 * `consumido`, ao contrário, NÃO é derivável no app: somá-lo exige os macros da
 * ficha em que cada refeição foi prescrita, e o app só tem em mãos a ativa.
 */
export interface ResumoRefeicoesDia {
    /** "AAAA-MM-DD" no fuso do usuário — ver config/fuso.ts. */
    dia: string;
    registros: RegistroRefeicaoComPrescricao[];
    consumido: Macros;
    metas: Macros;
    /** Quantas refeições a ficha ativa prescreve — o denominador de "faltam N". */
    totalRefeicoes: number;
}

export interface RegistroHidratacao {
    id: string;
    usuarioId: string;
    volumeMl: number;
    registradoEm: Date;
}

/**
 * O contrato das três rotas de hidratação — registrar, consultar e desfazer
 * devolvem todas isto.
 *
 * Registrar e desfazer devolverem o dia inteiro, e não só a linha afetada, é o
 * que evita o app ter de fazer um GET depois de cada toque para descobrir o
 * novo total.
 *
 * `metaMl` vem junto para a resposta bastar-se sozinha ("500 de 2000"), mesmo
 * o app já tendo a meta em dieta.metas.aguaMl vinda do plano.
 */
export interface ResumoHidratacaoDia {
    /** "AAAA-MM-DD" no fuso do usuário — ver config/fuso.ts. */
    dia: string;
    totalMl: number;
    metaMl: number;
    registros: RegistroHidratacao[];
}

export interface RegistroTreino {
    id: string;
    usuarioId: string;
    /** FK para SessaoTreino (a sessão prescrita que foi executada). */
    sessaoTreinoId: string;
    iniciadoEm: Date;
    /** Nulo enquanto o treino está em andamento. */
    concluidoEm: Date | null;
}

/**
 * Uma série executada, como o app a envia ao concluir o treino.
 *
 * `ordem` é o índice da série dentro do exercício, começando em 0 — é o que
 * distingue a primeira da terceira quando a carga cai no meio.
 */
export interface SerieExecutada {
    exercicioSessaoId: string;
    ordem: number;
    repeticoes: number;
    pesoKg: number | null;
}

/**
 * O treino concluído com tudo que a tela de resumo precisa.
 *
 * `totalSeries` e `volumeKg` são SOMADOS NO SERVIDOR, e não no app, pela mesma
 * razão que `ResumoRefeicoesDia.consumido`: quem lê o histórico de uma semana
 * atrás não tem em mãos as séries daquele dia para refazer a conta, e duas
 * implementações da mesma soma divergem.
 */
export interface TreinoConcluido {
    id: string;
    sessaoTreinoId: string;
    /** Nome da sessão prescrita ("Upper", "Push") — vem do JOIN. */
    sessaoNome: string;
    iniciadoEm: Date;
    concluidoEm: Date;
    /** Do início à conclusão. É o cronômetro que a tela mostrou. */
    duracaoSegundos: number;
    totalSeries: number;
    /** Σ peso × repetições de cada série. Zero se nada teve carga. */
    volumeKg: number;
    series: SerieExecutada[];
}

/**
 * O contrato das rotas de treino — abrir, concluir e consultar devolvem o
 * PERÍODO inteiro, no mesmo espírito de ResumoHidratacaoDia.
 *
 * O período é a SEMANA, e não o dia: a TreinoScreen mostra um card por dia da
 * semana e marca os que já foram feitos, então a pergunta que o app faz é "o
 * que já fiz nesta semana".
 *
 * NÃO existe um campo `sessoesFeitas: string[]`: seria derivável de `treinos` e
 * as duas cópias poderiam divergir — mesma decisão de `refeicoesFeitas`. O app
 * monta o conjunto com `new Set(treinos.map((t) => t.sessaoTreinoId))`.
 */
export interface ResumoTreinosPeriodo {
    /** "AAAA-MM-DD" no fuso do usuário — ver config/fuso.ts. */
    de: string;
    /** Inclusivo, ao contrário do `ate` exclusivo de `Periodo`. */
    ate: string;
    treinos: TreinoConcluido[];
}

/** Intervalo de consulta de histórico. */
export interface Periodo {
    de: Date;
    ate: Date;
}
