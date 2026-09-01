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
