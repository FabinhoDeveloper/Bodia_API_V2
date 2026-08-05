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
}

interface Sessao {
    nome: string;
    frequenciaSemanal: number;
}

export default class CalculoService {
    // escala 1,2-1,9 citada na fundamentação (Harris & Benedict, 1919; Mifflin et al., 1990)
    private static readonly FATOR_ATIVIDADE: Record<NivelAtividade, number> = {
        sedentario: 1.2,
        leve: 1.375,
        moderado: 1.55,
        intenso: 1.725,
        atleta: 1.9,
    };

    // déficit/superávit não fixados pela literatura - parâmetro de engenharia
    private static readonly AJUSTE_CALORICO: Record<Objetivo, number> = {
        perder: -0.2,
        manter: 0,
        ganhar: 0.125,
    };

    private static readonly PROTEINA_G_POR_KG: Record<Objetivo, number> = {
        perder: 2.7, // g/kg de massa magra (faixa ISSN 2,3-3,1, Jäger et al. 2017)
        manter: 1.7, // g/kg de peso total (faixa ISSN 1,4-2,0, Stokes et al. 2018)
        ganhar: 1.8, // g/kg de peso total, topo da faixa por causa do superávit anabólico
    };

    private static readonly GORDURA_PERCENTUAL_KCAL = 0.25; // meio da faixa ISSN 20-35% (Jäger et al. 2017)

    // dose-resposta citada (Pelland et al., 2024) sem número fechado - faixas 8-12/12-16/16-20, usando o meio
    private static readonly SERIES_POR_GRUPO_SEMANA: Record<NivelExperiencia, number> = {
        iniciante: 10,
        intermediario: 14,
        avancado: 18,
    };

    private static readonly SPLIT_POR_DIAS: Record<number, { split: string; sessoes: Sessao[] }> = {
        2: {
            split: "Full body",
            sessoes: [{ nome: "Corpo inteiro", frequenciaSemanal: 2 }],
        },
        3: {
            split: "Push / Pull / Legs",
            // cada grupo treinado só 1x/semana aqui - abaixo do ideal (Schoenfeld et al., 2016),
            // trade-off aceito por causa da disponibilidade de dias
            sessoes: [
                { nome: "Push", frequenciaSemanal: 1 },
                { nome: "Pull", frequenciaSemanal: 1 },
                { nome: "Legs", frequenciaSemanal: 1 },
            ],
        },
        4: {
            split: "Upper / Lower",
            sessoes: [
                { nome: "Upper", frequenciaSemanal: 2 },
                { nome: "Lower", frequenciaSemanal: 2 },
            ],
        },
        5: {
            split: "Upper/Lower + Push/Pull/Legs",
            sessoes: [
                { nome: "Upper", frequenciaSemanal: 1 },
                { nome: "Lower", frequenciaSemanal: 1 },
                { nome: "Push", frequenciaSemanal: 1 },
                { nome: "Pull", frequenciaSemanal: 1 },
                { nome: "Legs", frequenciaSemanal: 1 },
            ],
        },
        6: {
            split: "Push / Pull / Legs x2",
            sessoes: [
                { nome: "Push", frequenciaSemanal: 2 },
                { nome: "Pull", frequenciaSemanal: 2 },
                { nome: "Legs", frequenciaSemanal: 2 },
            ],
        },
    };

    calcular(perfil: PerfilInput): ResultadoCalculo {
        this.validarPerfil(perfil);

        const metabolismo = this.calcularMetabolismo(perfil);
        const meta = this.calcularMetaCalorica(perfil.objetivo, metabolismo.tdee);
        const macros = this.calcularMacros(perfil, meta.caloriasAlvo);
        const treino = this.calcularTreino(perfil);

        return { metabolismo, meta, macros, treino };
    }

    private validarPerfil(perfil: PerfilInput): void {
        if (!Number.isInteger(perfil.diasPorSemana) || perfil.diasPorSemana < 2 || perfil.diasPorSemana > 6) {
            throw new Error("diasPorSemana deve ser um inteiro entre 2 e 6");
        }
        if (perfil.peso <= 0) {
            throw new Error("peso deve ser maior que zero");
        }
        if (perfil.altura <= 0) {
            throw new Error("altura deve ser maior que zero");
        }
    }

    private calcularIdade(dataNascimento: string): number {
        const nascimento = new Date(dataNascimento);
        const hoje = new Date();

        let idade = hoje.getFullYear() - nascimento.getFullYear();
        const aindaNaoFezAniversarioEsteAno =
            hoje.getMonth() < nascimento.getMonth() ||
            (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());

        if (aindaNaoFezAniversarioEsteAno) {
            idade -= 1;
        }

        return idade;
    }

    private calcularIMC(peso: number, altura: number): number {
        const alturaMetros = altura / 100;
        return Math.round((peso / (alturaMetros * alturaMetros)) * 10) / 10;
    }

    private calcularTMB(sexo: Sexo, peso: number, altura: number, idade: number): number {
        const base = 10 * peso + 6.25 * altura - 5 * idade;
        return sexo === "M" ? base + 5 : base - 161;
    }

    private calcularMetabolismo(perfil: PerfilInput): ResultadoCalculo["metabolismo"] {
        const idade = this.calcularIdade(perfil.dataNascimento);
        const imc = this.calcularIMC(perfil.peso, perfil.altura);
        const tmb = Math.round(this.calcularTMB(perfil.sexo, perfil.peso, perfil.altura, idade));
        const fatorAtividade = CalculoService.FATOR_ATIVIDADE[perfil.nivelAtividade];
        const tdee = Math.round(tmb * fatorAtividade);

        return { idade, imc, tmb, fatorAtividade, tdee };
    }

    private calcularMetaCalorica(objetivo: Objetivo, tdee: number): ResultadoCalculo["meta"] {
        const ajustePercentual = CalculoService.AJUSTE_CALORICO[objetivo];
        const caloriasAlvo = Math.round(tdee * (1 + ajustePercentual));

        return { objetivo, ajustePercentual, caloriasAlvo };
    }

    private calcularMacros(perfil: PerfilInput, caloriasAlvo: number): ResultadoCalculo["macros"] {
        const massaReferenciaProteina =
            perfil.percentualGordura != null
                ? perfil.peso * (1 - perfil.percentualGordura / 100)
                : perfil.peso;

        const proteinaG = Math.round(
            CalculoService.PROTEINA_G_POR_KG[perfil.objetivo] * massaReferenciaProteina,
        );
        const proteinaKcal = proteinaG * 4;

        const gorduraKcal = Math.round(caloriasAlvo * CalculoService.GORDURA_PERCENTUAL_KCAL);
        const gorduraG = Math.round(gorduraKcal / 9);

        const carboidratoKcal = caloriasAlvo - proteinaKcal - gorduraKcal;
        if (carboidratoKcal < 0) {
            throw new Error(
                "Meta calórica insuficiente para cobrir a proteína e a gordura mínimas calculadas",
            );
        }
        const carboidratoG = Math.round(carboidratoKcal / 4);

        return {
            proteina: { g: proteinaG, kcal: proteinaKcal },
            gordura: { g: gorduraG, kcal: gorduraKcal },
            carboidrato: { g: carboidratoG, kcal: carboidratoKcal },
        };
    }

    private calcularTreino(perfil: PerfilInput): ResultadoCalculo["treino"] {
        const { split, sessoes } = CalculoService.SPLIT_POR_DIAS[perfil.diasPorSemana];
        const seriesPorGrupoSemana = CalculoService.SERIES_POR_GRUPO_SEMANA[perfil.nivelExperiencia];

        return { diasPorSemana: perfil.diasPorSemana, split, sessoes, seriesPorGrupoSemana };
    }
}
