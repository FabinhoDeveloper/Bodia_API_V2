import { NivelAtividade, Sexo } from "../types/perfil.types";

/**
 * Meta diária de hidratação.
 *
 * Antes isto era `META_AGUA_ML = 2000` fixo no plano.mapper — o mesmo número
 * para um homem de 95 kg atleta e uma mulher de 48 kg sedentária. O motor
 * determinístico nunca era consultado, e a tese do projeto é justamente que
 * todo número sai dele.
 *
 * A meta é ÁGUA BEBIDA, e não descontamos a que vem dos alimentos. Fica acima
 * da Ingestão Adequada da EFSA em termos de líquido puro, o que é a prática
 * usual em nutrição esportiva e dá margem de segurança.
 */

/**
 * Mililitros por quilo de peso, por nível de atividade.
 *
 * ⚠️ FONTE FRACA: a faixa de 35 a 45 ml/kg é heurística difundida em nutrição
 * esportiva, mas NÃO localizei literatura revisada por pares que a estabeleça.
 * O piso da EFSA abaixo é o que ancora a prescrição; esta escala é a parte que
 * personaliza. Mesmo tratamento dado a FRACAO_SECUNDARIO em volume-treino.ts —
 * ver Fontes_Volume_e_Descanso.md.
 *
 * A progressão acompanha o suor: quem treina mais perde mais líquido. Os passos
 * espelham a ordem de FATOR_ATIVIDADE no engine.service.
 */
export const ML_POR_KG: Record<NivelAtividade, number> = {
    sedentario: 35,
    leve: 38,
    moderado: 40,
    intenso: 43,
    atleta: 45,
};

/**
 * Ingestão Adequada da EFSA (2010, Scientific Opinion on Dietary Reference
 * Values for water): 2,0 L/dia para mulheres e 2,5 L/dia para homens.
 *
 * Serve de PISO, nunca de meta: quem é muito leve receberia menos que isso pela
 * conta de ml/kg. Uma mulher de 48 kg sedentária daria 1680 ml.
 *
 * ATENÇÃO ao usar esta citação na fundamentação: a EFSA define esses valores
 * como água TOTAL, incluindo a que vem dos alimentos (20-30% do total), e para
 * temperatura moderada e atividade moderada (PAL 1,6). Aqui eles são aplicados
 * como piso de água bebida, o que é mais conservador — não menos.
 */
export const AI_EFSA_ML: Record<Sexo, number> = {
    M: 2500,
    F: 2000,
};

/**
 * Arredondamento da meta. O app registra em incrementos de 250 e 500 ml, e uma
 * meta de "2483 ml" sugeriria uma precisão que a fórmula não tem.
 */
const ARREDONDAMENTO_ML = 50;

export function metaAguaMl(peso: number, sexo: Sexo, nivelAtividade: NivelAtividade): number {
    const porPeso = peso * ML_POR_KG[nivelAtividade];
    const comPiso = Math.max(porPeso, AI_EFSA_ML[sexo]);

    return Math.round(comPiso / ARREDONDAMENTO_ML) * ARREDONDAMENTO_ML;
}
