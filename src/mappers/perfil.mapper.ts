import { NivelAtividade, NivelExperiencia, Objetivo } from "@prisma/client";

import {
    NivelAtividade as NivelAtividadeApi,
    NivelExperiencia as NivelExperienciaApi,
    Objetivo as ObjetivoApi,
    PerfilInput,
    Sexo,
} from "../types/perfil.types";

/**
 * Traduz os valores que o app manda (minúsculo: "sedentario", "perder") para
 * os enums do banco (maiúsculo: SEDENTARIO, PERDER).
 *
 * Vivia dentro do UserRepository. Saiu de lá porque é tradução entre o
 * vocabulário da API e o do banco — a mesma natureza de trabalho dos outros
 * mappers —, e um repository deve saber gravar, não converter vocabulário.
 */
const ATIVIDADE: Record<string, NivelAtividade> = {
    sedentario: "SEDENTARIO",
    leve: "LEVE",
    moderado: "MODERADO",
    intenso: "INTENSO",
    atleta: "ATLETA",
};

const EXPERIENCIA: Record<string, NivelExperiencia> = {
    iniciante: "INICIANTE",
    intermediario: "INTERMEDIARIO",
    avancado: "AVANCADO",
};

const OBJETIVO: Record<string, Objetivo> = {
    perder: "PERDER",
    manter: "MANTER",
    ganhar: "GANHAR",
};

/**
 * O caminho de volta, do banco para o vocabulário da API.
 *
 * Existe porque o recálculo (RF34) e a edição de perfil (RF10) precisam montar
 * um `PerfilInput` a partir do usuário JÁ GRAVADO, e o EngineService fala o
 * vocabulário da API — ele não conhece os enums do Prisma, e não deve conhecer.
 *
 * As tabelas são derivadas das de ida, e não escritas à mão: duas listas
 * independentes divergiriam no dia em que um nível novo entrasse só numa delas.
 */
function inverter<T extends string>(tabela: Record<string, T>): Record<T, string> {
    return Object.fromEntries(
        Object.entries(tabela).map(([api, banco]) => [banco, api]),
    ) as Record<T, string>;
}

const ATIVIDADE_API = inverter(ATIVIDADE);
const EXPERIENCIA_API = inverter(EXPERIENCIA);
const OBJETIVO_API = inverter(OBJETIVO);

/** O usuário como o banco o guarda — só os campos que o motor consome. */
export interface UsuarioPersistido {
    sexo: string;
    dataNascimento: Date;
    alturaCm: number;
    percentualGordura: number | null;
    nivelAtividade: NivelAtividade;
    nivelExperiencia: NivelExperiencia;
    objetivo: Objetivo;
    diasPorSemana: number;
    numeroRefeicoes: number;
}

export default class PerfilMapper {
    nivelAtividade(valor: string): NivelAtividade {
        return ATIVIDADE[valor];
    }

    nivelExperiencia(valor: string): NivelExperiencia {
        return EXPERIENCIA[valor];
    }

    objetivo(valor: string): Objetivo {
        return OBJETIVO[valor];
    }

    /**
     * Remonta o `PerfilInput` do motor a partir do usuário gravado mais o peso
     * atual.
     *
     * O PESO vem de fora porque não está na tabela `Usuario`: ele vive em
     * `RegistroPeso`, e o atual é o registro mais recente. Guardá-lo nos dois
     * lugares deixaria as cópias divergirem — é a mesma decisão documentada no
     * schema.
     */
    paraMotor(usuario: UsuarioPersistido, pesoKg: number): PerfilInput {
        return {
            sexo: usuario.sexo as Sexo,
            dataNascimento: usuario.dataNascimento.toISOString().slice(0, 10),
            peso: pesoKg,
            altura: usuario.alturaCm,
            percentualGordura: usuario.percentualGordura,
            nivelAtividade: ATIVIDADE_API[usuario.nivelAtividade] as NivelAtividadeApi,
            nivelExperiencia: EXPERIENCIA_API[usuario.nivelExperiencia] as NivelExperienciaApi,
            objetivo: OBJETIVO_API[usuario.objetivo] as ObjetivoApi,
            diasPorSemana: usuario.diasPorSemana,
            numeroRefeicoes: usuario.numeroRefeicoes,
        };
    }
}
