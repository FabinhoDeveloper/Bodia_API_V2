import { NivelAtividade, NivelExperiencia, Objetivo } from "@prisma/client";

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
}
