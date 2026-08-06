import OpenAI from "openai";

// A API da DeepSeek é compatível com a interface Chat Completions da OpenAI,
// então o SDK oficial da OpenAI é reaproveitado apontando para outra baseURL.
let client: OpenAI | null = null;

// Teto abaixo do timeout do app (210s), para o usuário receber um erro de
// verdade do servidor em vez do timeout genérico do axios.
//
// ATENÇÃO: o `timeout` do SDK NÃO serve para isso sozinho. Ele é limpo assim
// que os cabeçalhos da resposta chegam (`clearTimeout` no finally de
// fetchWithTimeout), e a DeepSeek envia os cabeçalhos antes de terminar de
// gerar — uma chamada já durou 328s com este teto em 180s. Por isso o
// LlmService também passa um AbortSignal por requisição, que continua valendo
// durante a leitura do corpo.
export const deepseekTimeoutMs = 180000;

// O SDK repete a chamada 2x por padrão. Numa requisição de ~2 min que consome
// crédito, repetir automaticamente triplica custo e espera — falhar rápido e
// deixar o usuário decidir se tenta de novo é melhor.
const MAX_RETRIES = 0;

// O SDK valida a credencial já no construtor. Criar o cliente sob demanda evita
// que a falta da chave derrube o servidor inteiro no boot — sem a chave, só a
// rota que usa a IA falha, e com uma mensagem que diz o que fazer.
export function getDeepseekClient(): OpenAI {
    if (!client) {
        const apiKey = process.env.DEEPSEEK_API_KEY;

        if (!apiKey) {
            throw new Error("DEEPSEEK_API_KEY não configurada — defina a chave em backend/.env");
        }

        client = new OpenAI({
            apiKey,
            baseURL: "https://api.deepseek.com",
            timeout: deepseekTimeoutMs,
            maxRetries: MAX_RETRIES,
        });
    }

    return client;
}

export const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
