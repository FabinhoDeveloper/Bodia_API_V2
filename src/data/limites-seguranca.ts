import { Sexo } from "../types/perfil.types";

/**
 * Limites mínimos e máximos aplicados aos cálculos (RF17).
 *
 * São CONSTANTES EXPORTADAS, e não números soltos dentro do `engine.service`,
 * pelo mesmo motivo de `volume-treino.ts`: um limite que só existe dentro da
 * função que o aplica não pode ser conferido por um teste nem citado por outra
 * camada, e foi exatamente assim que a contradição do volume de treino passou
 * despercebida por tanto tempo.
 *
 * O princípio é o mesmo do `catalogo.filter`: a assimetria entre os erros
 * possíveis. Uma meta calórica conservadora demais atrasa o resultado de alguém;
 * uma meta baixa demais é restrição alimentar severa prescrita por um app a
 * quem nunca foi examinado por ninguém.
 */

/**
 * Piso calórico absoluto, em kcal/dia.
 *
 * 1200 para mulheres e 1500 para homens é o limiar abaixo do qual dietas são
 * classificadas como de muito baixa energia (VLED) e passam a exigir supervisão
 * clínica — abaixo dele fica difícil atingir as recomendações de micronutrientes
 * com alimentos comuns.
 *
 * ⚠️ PRECISA DE FONTE NA FUNDAMENTAÇÃO TEÓRICA. O número é o de uso corrente em
 * nutrição clínica, mas ainda não foi ancorado numa referência revisada por
 * pares neste projeto — mesmo tratamento dado a FRACAO_SECUNDARIO
 * (volume-treino.ts) e a ML_POR_KG (hidratacao.ts). Ver Fontes_Volume_e_Descanso.md.
 */
export const KCAL_MIN_ABSOLUTO: Record<Sexo, number> = {
    F: 1200,
    M: 1500,
};

/**
 * A meta calórica nunca fica abaixo da TMB × este fator.
 *
 * O piso absoluto acima não basta sozinho: para uma pessoa alta e pesada, 1500
 * kcal continua sendo um déficit extremo. Este limite acompanha o corpo de quem
 * está sendo calculado, e o outro cobre o caso oposto — alguém pequeno o
 * bastante para que uma fração da TMB ainda seja pouco demais.
 *
 * `1.0` significa: nunca prescrever menos energia do que o corpo gasta em
 * repouso. É deliberadamente conservador — o déficit vem do gasto com atividade,
 * não do metabolismo basal.
 */
export const FATOR_MIN_SOBRE_TMB = 1.0;

/**
 * Teto da proteína como fração das calorias da meta.
 *
 * Sem ele, um perfil pesado com objetivo de perda podia produzir uma prescrição
 * em que proteína e gordura sozinhas estouravam a meta — o `calcularMacros`
 * detectava isso e lançava erro, o que transformava um caso extremo em falha de
 * geração em vez de um plano seguro.
 *
 * 40% ainda é bem acima do topo da faixa da ISSN em termos práticos; é um teto
 * de segurança aritmética, não uma recomendação.
 */
export const PROTEINA_MAX_FRACAO_KCAL = 0.4;

/**
 * Faixas plausíveis do perfil.
 *
 * Não são julgamento sobre corpo nenhum: são o intervalo fora do qual o valor
 * certamente é erro de digitação ou de unidade — 1,75 no lugar de 175 cm, 800
 * no lugar de 80 kg. Um deles sozinho contamina TMB, meta calórica, macros e
 * hidratação de uma vez.
 */
export const PESO_MIN_KG = 25;
export const PESO_MAX_KG = 400;
export const ALTURA_MIN_CM = 100;
export const ALTURA_MAX_CM = 250;

/**
 * Idade mínima e máxima aceitas.
 *
 * A equação de Mifflin-St Jeor foi validada em adultos; abaixo dos 14 anos ela
 * não se aplica, e a prescrição de treino e dieta para adolescentes e crianças
 * está fora do escopo declarado do produto (o aviso legal diz isso ao usuário).
 */
export const IDADE_MIN = 14;
export const IDADE_MAX = 100;
