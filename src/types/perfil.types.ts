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
        sessoes: { nome: string; frequenciaSemanal: number }[];
        seriesPorGrupoSemana: number;
    };
    dieta: {
        numeroRefeicoes: number;
        refeicoes: MetaRefeicao[];
    };
}

export interface ContaInput {
    nome: string;
    sobrenome: string;
    email: string;
    senha: string;
}
