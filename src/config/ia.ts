import OpenAI from "openai";

/**
 * Cliente do provider de IA.
 *
 * O arquivo se chama `ia.ts`, e não `openai.ts`, abrindo exceção deliberada à
 * convenção `config/<provider>.ts` do CLAUDE.md: o projeto trocou de provider
 * três vezes (DeepSeek → Gemini → OpenAI) em uma semana. O provider virou valor
 * de CONFIGURAÇÃO, não identidade do código — trocar de novo é editar o .env.
 * (`prisma.ts` continua seguindo a regra original, porque o banco não é
 * intercambiável do mesmo jeito.)
 *
 * O que torna isso possível é o SDK da OpenAI aceitar `baseURL`: DeepSeek e
 * Gemini expõem endpoints compatíveis com a interface Chat Completions, então
 * o mesmo cliente serve os três.
 */

let client: OpenAI | null = null;

/**
 * Teto POR CHAMADA. A geração são três chamadas curtas (seleção de alimentos,
 * quantidades e treino), então o limite é de cada uma, não do conjunto:
 * 3 × 60s ainda cabe folgado nos 210s de timeout do axios no app.
 *
 * ATENÇÃO: o `timeout` do SDK NÃO basta sozinho. Ele é limpo assim que os
 * cabeçalhos da resposta chegam, e a geração acontece depois disso — foi assim
 * que uma chamada durou 328s com o teto em 180s. Por isso o AiService também
 * passa um AbortSignal por requisição, que continua valendo durante a leitura
 * do corpo.
 */
export const iaTimeoutMs = 60000;

// O SDK repete a chamada 2x por padrão. Numa requisição que consome crédito,
// repetir automaticamente triplica custo e espera — falhar rápido e deixar o
// usuário decidir se tenta de novo é melhor.
const MAX_RETRIES = 0;

/**
 * Endpoint do provider. Vazio (o normal) significa OpenAI: o SDK usa o próprio
 * padrão. Preencher só para apontar a um provider compatível — por exemplo
 * `https://api.deepseek.com` ou
 * `https://generativelanguage.googleapis.com/v1beta/openai/`.
 *
 * CUIDADO: esta variável decide para onde a sua chave é enviada. Um valor
 * errado entrega a credencial ao host errado. Só aponte para provider confiável.
 */
function baseUrlConfigurada(): string | undefined {
    // `|| undefined` e não o valor cru: string vazia quebra a resolução do
    // endpoint no SDK, em vez de cair no padrão como se esperaria.
    return process.env.IA_BASE_URL || undefined;
}

// O SDK valida a credencial já no construtor. Criar o cliente sob demanda evita
// que a falta da chave derrube o servidor inteiro no boot — sem a chave, só a
// rota que usa a IA falha, e com uma mensagem que diz o que fazer.
export function getIaClient(): OpenAI {
    if (!client) {
        const apiKey = process.env.IA_API_KEY;

        if (!apiKey) {
            throw new Error("IA_API_KEY não configurada — defina a chave em backend/.env");
        }

        client = new OpenAI({
            apiKey,
            baseURL: baseUrlConfigurada(),
            timeout: iaTimeoutMs,
            maxRetries: MAX_RETRIES,
        });
    }

    return client;
}

/**
 * Modelo usado nas três chamadas.
 *
 * O padrão é um modelo de chat, não de raciocínio, e isso não é só preço: o
 * AiService envia `temperature: 0.2` e `max_tokens`, e modelos de raciocínio
 * rejeitam os dois — exigem `max_completion_tokens` e só aceitam a temperatura
 * padrão. Abrir mão da temperatura baixa contrariaria a fundamentação 4.2.3,
 * que trata a estocasticidade como problema de reprodutibilidade.
 *
 * Se um dia a etapa de quantidades precisar de raciocínio, o caminho é uma
 * segunda instância de AiService só para ela — as chamadas já estão separadas.
 */
export const iaModel = process.env.IA_MODEL || "gpt-4o-mini";

/**
 * Quando true, a rota usa o PlanoSimuladoGenerator em vez de chamar a IA.
 *
 * Continua ligada por padrão: mesmo com a geração dividida em três chamadas,
 * desenvolver o resto do produto sem depender de rede e de crédito é o que
 * torna a suíte e o dia a dia rápidos. Desligue com SIMULAR_IA=false para
 * exercitar o caminho real.
 */
export const simularIa = (process.env.SIMULAR_IA ?? "true").toLowerCase() !== "false";
