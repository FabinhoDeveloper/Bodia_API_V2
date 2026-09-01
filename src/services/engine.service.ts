import { metaAguaMl } from "../data/hidratacao";
import {
    ALTURA_MAX_CM,
    ALTURA_MIN_CM,
    FATOR_MIN_SOBRE_TMB,
    IDADE_MAX,
    IDADE_MIN,
    KCAL_MIN_ABSOLUTO,
    PESO_MAX_KG,
    PESO_MIN_KG,
    PROTEINA_MAX_FRACAO_KCAL,
} from "../data/limites-seguranca";
import ValidationError from "../errors/validation.error";
import {
    cabeNaSessao,
    FRACAO_SECUNDARIO,
    GRUPOS_POR_SESSAO,
    MAX_SERIES_POR_GRUPO_SESSAO,
    MIN_SERIES_POR_EXERCICIO,
} from "../data/volume-treino";
import {
    MetaRefeicao,
    NivelAtividade,
    NivelExperiencia,
    Objetivo,
    PerfilInput,
    ResultadoCalculo,
    Sexo,
    VolumeGrupo,
} from "../types/perfil.types";

interface Sessao {
    nome: string;
    frequenciaSemanal: number;
}

/**
 * Motor determinístico do BodIA — primeira camada da arquitetura híbrida
 * descrita na fundamentação teórica. Recebe o perfil do usuário e calcula,
 * sem nenhuma intervenção do LLM, tudo que tem número: TMB (Mifflin-St Jeor),
 * TDEE, meta calórica por objetivo, distribuição de macronutrientes e a
 * estrutura de treino (split, sessões, séries por grupo muscular).
 *
 * O resultado (ResultadoCalculo) é o que o PlanoPrompt injeta no prompt da
 * IA — o LLM só recebe estes valores prontos, nunca recalcula nada aqui.
 *
 * Os LIMITES DE SEGURANÇA (RF17) são aplicados em duas frentes: na entrada,
 * pelo `validarPerfil`, que recusa o que não pode ser calculado; e na saída,
 * pelos pisos e tetos de `data/limites-seguranca.ts`, que aparam o resultado.
 * As duas coisas são necessárias — um perfil perfeitamente plausível ainda pode
 * produzir uma meta calórica baixa demais depois do déficit.
 */
export default class EngineService {
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

    // Nome e fatia do total diário de cada refeição, para cada quantidade que o
    // usuário pode escolher no onboarding. A fundamentação teórica não fixa
    // distribuição por refeição — estes percentuais são parâmetro de engenharia,
    // seguindo a prática usual de concentrar no almoço. Cada linha soma 100%.
    //
    // Quem escolhe a QUANTIDADE é o usuário; quem decide a REPARTIÇÃO é esta
    // tabela. Nenhum dos dois é decisão do LLM: ele recebe as metas já prontas.
    //
    // Existem também para dar ao LLM uma meta pequena por refeição em vez do
    // total do dia: dividir um problema de 4 restrições em N problemas menores
    // reduz drasticamente o raciocínio que ele gasta tentando fechar as contas.
    //
    // Os nomes precisam continuar batendo com HORARIO_POR_REFEICAO, em
    // mappers/plano.mapper.ts — é por eles que o horário sugerido é casado.
    private static readonly DISTRIBUICAO_REFEICOES: Record<number, [string, number][]> = {
        3: [
            ["Café da manhã", 0.25],
            ["Almoço", 0.4],
            ["Jantar", 0.35],
        ],
        4: [
            ["Café da manhã", 0.2],
            ["Almoço", 0.35],
            ["Lanche da tarde", 0.15],
            ["Jantar", 0.3],
        ],
        5: [
            ["Café da manhã", 0.2],
            ["Lanche da manhã", 0.1],
            ["Almoço", 0.35],
            ["Lanche da tarde", 0.1],
            ["Jantar", 0.25],
        ],
        6: [
            ["Café da manhã", 0.2],
            ["Lanche da manhã", 0.1],
            ["Almoço", 0.3],
            ["Lanche da tarde", 0.1],
            ["Jantar", 0.2],
            ["Ceia", 0.1],
        ],
    };

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
        const meta = this.calcularMetaCalorica(perfil, metabolismo);
        const macros = this.calcularMacros(perfil, meta.caloriasAlvo);
        const treino = this.calcularTreino(perfil);
        const dieta = this.calcularDieta(perfil, meta, macros);

        return { metabolismo, meta, macros, treino, dieta };
    }

    private validarPerfil(perfil: PerfilInput): void {
        if (!Number.isInteger(perfil.diasPorSemana) || perfil.diasPorSemana < 2 || perfil.diasPorSemana > 6) {
            throw new ValidationError("diasPorSemana deve ser um inteiro entre 2 e 6");
        }
        if (
            !Number.isInteger(perfil.numeroRefeicoes) ||
            perfil.numeroRefeicoes < 3 ||
            perfil.numeroRefeicoes > 6
        ) {
            throw new ValidationError("numeroRefeicoes deve ser um inteiro entre 3 e 6");
        }
        // RF17 na ENTRADA. As faixas não são julgamento sobre corpo nenhum: são
        // o intervalo fora do qual o valor certamente é erro de digitação ou de
        // unidade (1,75 em vez de 175 cm), e um deles contamina TMB, meta
        // calórica, macros e hidratação de uma vez só.
        if (!Number.isFinite(perfil.peso) || perfil.peso < PESO_MIN_KG || perfil.peso > PESO_MAX_KG) {
            throw new ValidationError(`peso deve estar entre ${PESO_MIN_KG} e ${PESO_MAX_KG} kg`);
        }
        if (
            !Number.isFinite(perfil.altura) ||
            perfil.altura < ALTURA_MIN_CM ||
            perfil.altura > ALTURA_MAX_CM
        ) {
            throw new ValidationError(
                `altura deve estar entre ${ALTURA_MIN_CM} e ${ALTURA_MAX_CM} cm`,
            );
        }

        const idade = this.calcularIdade(perfil.dataNascimento);

        if (!Number.isFinite(idade) || idade < IDADE_MIN || idade > IDADE_MAX) {
            throw new ValidationError(
                `idade deve estar entre ${IDADE_MIN} e ${IDADE_MAX} anos`,
            );
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
        const fatorAtividade = EngineService.FATOR_ATIVIDADE[perfil.nivelAtividade];
        const tdee = Math.round(tmb * fatorAtividade);

        return { idade, imc, tmb, fatorAtividade, tdee };
    }

    /**
     * A meta calórica, com o PISO de segurança do RF17 aplicado depois do ajuste.
     *
     * São dois pisos, e o maior vence, porque cada um cobre o que o outro deixa
     * passar: o absoluto (`KCAL_MIN_ABSOLUTO`) protege quem é pequeno o
     * suficiente para que uma fração da TMB ainda seja pouco demais; o relativo
     * (`FATOR_MIN_SOBRE_TMB`) protege quem é grande o suficiente para que 1500
     * kcal continuem sendo um déficit extremo.
     *
     * O piso é aplicado AQUI, e não no fim de tudo, porque os macros são
     * calculados a partir da meta: aparar depois deixaria proteína, carboidrato
     * e gordura somando um total que a meta não tem mais.
     */
    private calcularMetaCalorica(
        perfil: PerfilInput,
        metabolismo: ResultadoCalculo["metabolismo"],
    ): ResultadoCalculo["meta"] {
        const ajustePercentual = EngineService.AJUSTE_CALORICO[perfil.objetivo];
        const calculado = Math.round(metabolismo.tdee * (1 + ajustePercentual));

        const piso = Math.max(
            KCAL_MIN_ABSOLUTO[perfil.sexo],
            Math.round(metabolismo.tmb * FATOR_MIN_SOBRE_TMB),
        );

        // Sem log: este service é PURO, e é chamado a cada geração e a cada
        // recálculo de peso. Que o piso agiu se lê no resultado que o
        // plan.service já imprime — `tdee × (1 + ajustePercentual)` diferente de
        // `caloriasAlvo` é exatamente isso.
        return { objetivo: perfil.objetivo, ajustePercentual, caloriasAlvo: Math.max(calculado, piso) };
    }

    private calcularMacros(perfil: PerfilInput, caloriasAlvo: number): ResultadoCalculo["macros"] {
        const massaReferenciaProteina =
            perfil.percentualGordura != null
                ? perfil.peso * (1 - perfil.percentualGordura / 100)
                : perfil.peso;

        // RF17 na SAÍDA: o teto impede que proteína e gordura sozinhas estourem
        // a meta. Sem ele o caso extremo virava erro de geração — o usuário via
        // "não foi possível gerar seu plano" em vez de um plano seguro.
        const proteinaKcalMax = Math.floor(caloriasAlvo * PROTEINA_MAX_FRACAO_KCAL);
        const proteinaG = Math.min(
            Math.round(EngineService.PROTEINA_G_POR_KG[perfil.objetivo] * massaReferenciaProteina),
            Math.floor(proteinaKcalMax / 4),
        );
        const proteinaKcal = proteinaG * 4;

        const gorduraKcal = Math.round(caloriasAlvo * EngineService.GORDURA_PERCENTUAL_KCAL);
        const gorduraG = Math.round(gorduraKcal / 9);

        const carboidratoKcal = caloriasAlvo - proteinaKcal - gorduraKcal;
        if (carboidratoKcal < 0) {
            throw new ValidationError(
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
        const { split, sessoes } = EngineService.SPLIT_POR_DIAS[perfil.diasPorSemana];
        const seriesPorGrupoSemana = EngineService.SERIES_POR_GRUPO_SEMANA[perfil.nivelExperiencia];

        return {
            diasPorSemana: perfil.diasPorSemana,
            split,
            sessoes: sessoes.map((sessao) => ({
                ...sessao,
                volume: this.orcarSessao(sessao, seriesPorGrupoSemana),
            })),
            seriesPorGrupoSemana,
        };
    }

    /**
     * O orçamento de séries de UMA sessão, por grupo muscular — já dividido pela
     * frequência semanal, para o LLM não ter divisão nenhuma a fazer.
     *
     * Antes, o motor entregava só o total semanal e o prompt mandava "distribua".
     * Isso não fechava: aplicado a todos os 7 grupos de um Upper, o total exigia
     * 14 exercícios num limite de 7. O modelo então fazia algo arbitrário.
     *
     * Agora a viabilidade é garantida por CONSTRUÇÃO: depois de montar o
     * orçamento, `aparar` reduz o volume até ele caber nos limites da sessão.
     */
    private orcarSessao(sessao: Sessao, seriesPorGrupoSemana: number): VolumeGrupo[] {
        const grupos = GRUPOS_POR_SESSAO[sessao.nome];

        // Split sem tabela de grupos: sem orçamento, e o prompt cai no texto
        // genérico. Não inventa alocação para um split que ninguém revisou.
        if (!grupos) return [];

        // A frequência entra aqui: um grupo treinado 2x por semana recebe metade
        // do volume semanal em cada sessão. O teto por sessão impede que um
        // split de baixa frequência empilhe a semana inteira num treino só.
        const porSessao = (semanal: number) =>
            Math.min(
                Math.max(Math.round(semanal / sessao.frequenciaSemanal), MIN_SERIES_POR_EXERCICIO),
                MAX_SERIES_POR_GRUPO_SESSAO,
            );

        const volume: VolumeGrupo[] = [
            ...grupos.primario.map((grupo) => ({
                grupo,
                series: porSessao(seriesPorGrupoSemana),
                papel: "primario" as const,
            })),
            ...grupos.secundario.map((grupo) => ({
                grupo,
                series: porSessao(seriesPorGrupoSemana * FRACAO_SECUNDARIO),
                papel: "secundario" as const,
            })),
        ];

        return this.aparar(volume);
    }

    /**
     * Reduz o orçamento até ele caber no limite de exercícios da sessão.
     *
     * Apara o secundário primeiro, e só depois o primário: se algo tem de ceder,
     * cede o volume direto dos grupos pequenos — que ainda recebem estímulo
     * indireto dos compostos — antes do volume dos grandes, que é o que a
     * dose-resposta de hipertrofia mede.
     */
    private aparar(volume: VolumeGrupo[]): VolumeGrupo[] {
        const atual = volume.map((item) => ({ ...item }));

        for (const papel of ["secundario", "primario"] as const) {
            // Uma série por vez, sempre do grupo mais volumoso daquele papel:
            // assim a redução distribui em vez de zerar um grupo só.
            while (!cabeNaSessao(atual)) {
                const candidatos = atual.filter(
                    (item) => item.papel === papel && item.series > MIN_SERIES_POR_EXERCICIO,
                );
                if (candidatos.length === 0) break;

                candidatos.sort((a, b) => b.series - a.series)[0].series -= 1;
            }
        }

        return atual;
    }

    /**
     * Reparte a meta diária entre as refeições. A última refeição recebe o que
     * sobrou em vez do seu percentual: assim a soma das partes fecha exatamente
     * o total do dia, sem o centavo perdido no arredondamento de cada fatia.
     */
    private calcularDieta(
        perfil: PerfilInput,
        meta: ResultadoCalculo["meta"],
        macros: ResultadoCalculo["macros"],
    ): ResultadoCalculo["dieta"] {
        const numeroRefeicoes = perfil.numeroRefeicoes;
        const distribuicao = EngineService.DISTRIBUICAO_REFEICOES[numeroRefeicoes];

        const restante = {
            kcal: meta.caloriasAlvo,
            proteina: macros.proteina.g,
            carboidrato: macros.carboidrato.g,
            gordura: macros.gordura.g,
        };

        const refeicoes = distribuicao.map(([nome, fatia], indice) => {
            const ultima = indice === distribuicao.length - 1;

            const porcao = {
                nome,
                kcal: ultima ? restante.kcal : Math.round(meta.caloriasAlvo * fatia),
                proteina: ultima ? restante.proteina : Math.round(macros.proteina.g * fatia),
                carboidrato: ultima ? restante.carboidrato : Math.round(macros.carboidrato.g * fatia),
                gordura: ultima ? restante.gordura : Math.round(macros.gordura.g * fatia),
            };

            restante.kcal -= porcao.kcal;
            restante.proteina -= porcao.proteina;
            restante.carboidrato -= porcao.carboidrato;
            restante.gordura -= porcao.gordura;

            return porcao;
        });

        return {
            numeroRefeicoes,
            refeicoes,
            metaAguaMl: metaAguaMl(perfil.peso, perfil.sexo, perfil.nivelAtividade),
        };
    }
}
