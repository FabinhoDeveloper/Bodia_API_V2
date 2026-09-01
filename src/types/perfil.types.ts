/**
 * Tipos do perfil do usuário e do resultado do motor determinístico.
 *
 * Vivem aqui, e não junto da classe que os produz, porque são consumidos por
 * camadas que não podem depender de `services/` — o repository precisa do
 * `ResultadoCalculo` para gravar a ficha, e um repository importando um
 * service é dependência para cima.
 */

export type Sexo = "M" | "F";
export type NivelAtividade = "sedentario" | "leve" | "moderado" | "intenso" | "atleta";
export type NivelExperiencia = "iniciante" | "intermediario" | "avancado";
export type Objetivo = "perder" | "manter" | "ganhar";

export interface PerfilInput {
    sexo: Sexo;
    dataNascimento: string;
    peso: number;
    altura: number;
    percentualGordura: number | null;
    nivelAtividade: NivelAtividade;
    nivelExperiencia: NivelExperiencia;
    objetivo: Objetivo;
    diasPorSemana: number;
    numeroRefeicoes: number;
}

/** O perfil como chega do app: o PerfilInput mais os chips de restrição. */
export interface PerfilOnboardingInput extends PerfilInput {
    restricoesAlimentares: string[];
    restricoesFisicas: string[];
}

/**
 * O recorte do perfil que o gerador de plano precisa. Só as restrições — o
 * resto dos números já vem pronto no ResultadoCalculo.
 */
export interface PerfilParaPlano {
    restricoesAlimentares: string[];
    restricoesFisicas: string[];
}

export interface MetaRefeicao {
    nome: string;
    kcal: number;
    proteina: number;
    carboidrato: number;
    gordura: number;
}

/** Papel do grupo dentro da sessão — define quanto volume direto ele recebe. */
export type PapelGrupo = "primario" | "secundario";

/** Uma linha do orçamento de treino: quantas séries daquele grupo, na sessão. */
export interface VolumeGrupo {
    grupo: string;
    series: number;
    papel: PapelGrupo;
}

export interface ResultadoCalculo {
    metabolismo: {
        idade: number;
        imc: number;
        tmb: number;
        fatorAtividade: number;
        tdee: number;
    };
    meta: {
        objetivo: Objetivo;
        ajustePercentual: number;
        caloriasAlvo: number;
    };
    macros: {
        proteina: { g: number; kcal: number };
        gordura: { g: number; kcal: number };
        carboidrato: { g: number; kcal: number };
    };
    treino: {
        diasPorSemana: number;
        split: string;
        sessoes: {
            nome: string;
            frequenciaSemanal: number;
            /**
             * O orçamento de séries por grupo NESTA sessão, já dividido pela
             * frequência semanal. Vazio quando o split não tem tabela de grupos
             * revisada — ver services/volume-treino.ts.
             */
            volume: VolumeGrupo[];
        }[];
        /** O alvo semanal que originou o orçamento; é o que o validador confere. */
        seriesPorGrupoSemana: number;
    };
    dieta: {
        numeroRefeicoes: number;
        /** Meta diária de água BEBIDA, em ml — ver data/hidratacao.ts. */
        metaAguaMl: number;
        refeicoes: MetaRefeicao[];
    };
}

export interface ContaInput {
    nome: string;
    sobrenome: string;
    email: string;
    senha: string;
    /**
     * Aceite do aviso legal e da política de privacidade (RF36).
     *
     * Viaja no payload do cadastro, e não numa rota própria: o aceite é
     * condição para a conta existir, e uma chamada separada abriria a janela em
     * que a conta existe sem ele.
     */
    aceiteTermos: boolean;
}

/** Um ponto do histórico de peso, como o app o exibe. */
export interface RegistroPesoDTO {
    id: string;
    pesoKg: number;
    registradoEm: Date;
}

/**
 * O contrato das rotas de peso — registrar e consultar devolvem os dois o mesmo
 * formato, no mesmo espírito de ResumoHidratacaoDia: registrar já traz as metas
 * recalculadas, então a tela nunca precisa de um GET depois.
 *
 * `pesoAtualKg` NÃO é campo à parte: é `historico[0].pesoKg`, e duas cópias do
 * mesmo fato divergem. O app lê o primeiro item.
 */
export interface ResumoPeso {
    historico: RegistroPesoDTO[];
    /**
     * As metas depois do recálculo (RF34) — TMB, GET, calorias, macros e água.
     * Nulo quando o usuário ainda não tem ficha ativa.
     */
    metas: {
        tmb: number;
        tdee: number;
        caloriasAlvo: number;
        proteinaG: number;
        carboidratoG: number;
        gorduraG: number;
        metaAguaMl: number;
    } | null;
    /**
     * O cardápio prescrito continua sendo o da ficha anterior, montado para a
     * meta calórica antiga. `true` avisa a tela para oferecer a regeneração
     * (RF20) em vez de deixar o usuário com refeições que não somam mais a meta.
     */
    planoDesatualizado: boolean;
}

/**
 * Os campos que a edição de perfil aceita (RF10 / UC06). Todos opcionais: a
 * tela manda só o que mudou.
 *
 * `peso` NÃO está aqui de propósito: ele tem rota própria (`POST /api/peso`),
 * porque pesar-se é um EVENTO com histórico, e não um campo que se sobrescreve.
 * Aceitá-lo nos dois lugares criaria dois caminhos para o mesmo fato.
 *
 * O e-mail também fica de fora: trocá-lo é trocar a credencial de acesso, e
 * exige confirmação do endereço novo — fluxo próprio, não um campo de formulário.
 */
export interface PerfilUpdateInput {
    nome?: string;
    sobrenome?: string;
    sexo?: Sexo;
    dataNascimento?: string;
    altura?: number;
    percentualGordura?: number | null;
    nivelAtividade?: NivelAtividade;
    nivelExperiencia?: NivelExperiencia;
    objetivo?: Objetivo;
    diasPorSemana?: number;
    numeroRefeicoes?: number;
    restricoesAlimentares?: string[];
    restricoesFisicas?: string[];
}

/**
 * O que a edição devolve: o perfil já gravado, as metas recalculadas e o aviso
 * de que o cardápio ficou defasado.
 *
 * `recalculado` é `false` no caso do FA02 do UC06 — o usuário mexeu só nas
 * restrições, que não entram em nenhuma fórmula. Dizer "metas atualizadas"
 * quando nada mudou treinaria o usuário a ignorar o aviso.
 */
export interface PerfilAtualizado {
    perfil: {
        nome: string;
        sobrenome: string;
        sexo: Sexo;
        dataNascimento: string;
        alturaCm: number;
        percentualGordura: number | null;
        nivelAtividade: NivelAtividade;
        nivelExperiencia: NivelExperiencia;
        objetivo: Objetivo;
        diasPorSemana: number;
        numeroRefeicoes: number;
        restricoesAlimentares: string[];
        restricoesFisicas: string[];
    };
    recalculado: boolean;
    metas: ResumoPeso["metas"];
    planoDesatualizado: boolean;
}
