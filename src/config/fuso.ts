import { Periodo } from "../types/registro.types";

/**
 * A que dia pertence um registro.
 *
 * O servidor roda em UTC e o usuário não. Uma ceia às 22h em Brasília é 01h
 * UTC do dia SEGUINTE, então cortar o dia pela data UTC jogaria o registro no
 * dia errado — e o app mostraria a água da noite já contando para amanhã.
 *
 * Por isso o recorte é feito aqui, na leitura, e não gravado numa coluna:
 * `RegistroHidratacao` guarda só o instante.
 *
 * Fica em config/ porque é característica do ambiente, não regra de domínio —
 * mesmo lugar de ia.ts, que também exporta função e não só constante.
 * E fica num arquivo próprio, em vez de dentro do service que usa hoje, porque
 * os registros de refeição e de treino vão precisar exatamente do mesmo corte:
 * duas cópias desta conta divergiriam, como já divergiram as duas cópias do
 * cálculo de macros antes do validador-macros existir.
 */

/**
 * America/Sao_Paulo. Constante, e não `Intl`/`toLocaleString`, porque o Brasil
 * não tem horário de verão desde 2019 — o offset é fixo.
 *
 * Limitação assumida: quem estiver em Manaus (-4) ou no Acre (-5), ou viajando
 * para fora, tem o dia recortado pelo relógio de São Paulo. Consertar isso
 * exige guardar o fuso do usuário, o que só vale a pena quando houver usuário
 * fora do fuso.
 */
export const FUSO_OFFSET_HORAS = -3;

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;
const OFFSET_MS = FUSO_OFFSET_HORAS * MS_POR_HORA;

/**
 * Desloca o instante para que os getters `getUTC*` leiam o relógio LOCAL.
 *
 * É o truque que evita depender do fuso da máquina onde o Node roda: em vez de
 * `getHours()` (que responde conforme o TZ do servidor), soma-se o offset e
 * lê-se em UTC. O resultado só serve para extrair as partes da data — como
 * instante ele está errado de propósito.
 */
function comoRelogioLocal(instante: Date): Date {
    return new Date(instante.getTime() + OFFSET_MS);
}

/**
 * O intervalo UTC que corresponde ao dia local em que `instante` cai.
 *
 * `ate` é EXCLUSIVO (meia-noite do dia seguinte), então a consulta usa `lt` e
 * não `lte` — com `lte`, um registro feito exatamente à meia-noite entraria
 * nos dois dias.
 */
export function janelaDoDia(instante: Date): Periodo {
    const local = comoRelogioLocal(instante);

    // Meia-noite local, ainda expressa como se fosse UTC...
    const meiaNoiteLocal = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
    );

    // ...e de volta ao instante UTC de verdade.
    const de = new Date(meiaNoiteLocal - OFFSET_MS);

    return { de, ate: new Date(de.getTime() + MS_POR_DIA) };
}

/**
 * O intervalo UTC da SEMANA local em que `instante` cai, de segunda a domingo.
 *
 * Existe porque o treino é prescrito por semana: a `TreinoScreen` mostra um card
 * por dia da semana e marca os que já foram feitos, então a pergunta que o app
 * faz não é "o que fiz hoje" (como na água e na refeição) e sim "o que já fiz
 * nesta semana".
 *
 * A semana começa na SEGUNDA porque é assim que `DIAS_POR_QUANTIDADE` distribui
 * o treino — um split de 4 dias cai em Segunda, Terça, Quinta e Sexta. Começar
 * no domingo, como faz `Date.getDay()`, partiria a semana de treino ao meio.
 *
 * `ate` é exclusivo, mesma regra de `janelaDoDia`.
 */
export function janelaDaSemana(instante: Date): Periodo {
    const hoje = janelaDoDia(instante);
    // getUTCDay sobre o relógio local: 0 = domingo. Deslocado para 0 = segunda,
    // que é quanto a semana já andou.
    const diasDesdeSegunda = (comoRelogioLocal(instante).getUTCDay() + 6) % 7;

    const de = new Date(hoje.de.getTime() - diasDesdeSegunda * MS_POR_DIA);

    return { de, ate: new Date(de.getTime() + 7 * MS_POR_DIA) };
}

/** O dia local de um instante, em "AAAA-MM-DD" — é o que o app exibe. */
export function diaISO(instante: Date): string {
    return comoRelogioLocal(instante).toISOString().slice(0, 10);
}

/**
 * Interpreta um "AAAA-MM-DD" vindo da query string como meia-noite LOCAL
 * daquele dia. Devolve null se o formato não bater, para o service poder
 * responder 400 em vez de trabalhar com um Invalid Date.
 *
 * Sem isso, `new Date("2026-08-19")` seria meia-noite UTC — 21h do dia
 * anterior em Brasília —, e consultar um dia devolveria o dia errado.
 */
export function interpretarDia(texto: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;

    const instante = new Date(`${texto}T00:00:00.000Z`).getTime() - OFFSET_MS;
    if (Number.isNaN(instante)) return null;

    return new Date(instante);
}
