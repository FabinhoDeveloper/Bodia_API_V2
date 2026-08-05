import OpenAI from "openai";

// A API da DeepSeek é compatível com a interface Chat Completions da OpenAI,
// então o SDK oficial da OpenAI é reaproveitado apontando para outra baseURL.
let client: OpenAI | null = null;

// O SDK valida a credencial já no construtor. Criar o cliente sob demanda evita
// que a falta da chave derrube o servidor inteiro no boot — sem a chave, só a
// rota que usa a IA falha, e com uma mensagem que diz o que fazer.
export function getDeepseekClient(): OpenAI {
    if (!client) {
        const apiKey = process.env.DEEPSEEK_API_KEY;

        if (!apiKey) {
            throw new Error("DEEPSEEK_API_KEY não configurada — defina a chave em backend/.env");
        }

        client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
    }

    return client;
}

export const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
