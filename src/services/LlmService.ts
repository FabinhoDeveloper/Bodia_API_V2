import OpenAI from "openai";

import { RespostaLlmComMetricas } from "../types/benchmark.types";

/**
 * Cliente de IA do BodIA: fala com a DeepSeek (modelo configurado em
 * src/config/deepseek.ts, hoje deepseek-v4-pro) através do SDK da OpenAI, já
 * que a API da DeepSeek é compatível com a interface Chat Completions.
 *
 * Não conhece treino, dieta nem nenhuma regra de negócio — só manda mensagem
 * e devolve texto (enviarMensagem) ou JSON (gerarJson, usado pelo
 * PlanoService). Todo o conteúdo enviado já vem pronto do PromptService.
 */
export default class LlmService {
    private readonly criarClient;
    private readonly model;
    private readonly timeoutMs;

    // Recebe uma função em vez do cliente pronto: o SDK exige a credencial já na
    // construção, então o cliente só é criado quando a IA é de fato usada.
    constructor(criarClient: () => OpenAI, model: string, timeoutMs: number) {
        this.criarClient = criarClient;
        this.model = model;
        this.timeoutMs = timeoutMs;
    }

    async enviarMensagem(mensagem: string): Promise<string> {
        const resposta = await this.criarClient().chat.completions.create({
            model: this.model,
            messages: [{ role: "user", content: mensagem }],
        });

        return resposta.choices[0]?.message?.content ?? "";
    }

    /**
     * Monta exatamente a mesma chamada chat.completions.create usada em
     * produção (mesmo model, response_format, temperature, reasoning_effort,
     * max_tokens e AbortSignal de timeout) e devolve a resposta crua da API.
     *
     * Extraído para existir um único lugar com estes parâmetros — gerarJson
     * (produção) e gerarJsonComMetricas (benchmark, src/services/PlanoService
     * .gerarComMetricas) chamam este mesmo método, então o benchmark nunca
     * pode divergir silenciosamente do que o app realmente usa.
     */
    private async criarChatCompletion(system: string, user: string) {
        return this.criarClient().chat.completions.create(
            {
                model: this.model,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
                response_format: { type: "json_object" },
                temperature: 0.2,
                // O raciocínio vem ligado por padrão no esforço mais alto e é
                // ele que domina o tempo. Sem limite ele dispara: uma chamada
                // real gastou os 32000 tokens inteiros raciocinando e devolveu
                // conteúdo VAZIO (finish_reason=length), perdendo 328s e o custo
                // integral. Desligar de vez não serve — sem raciocínio o modelo
                // erra os macros (gordura saiu -34,8% num teste).
                //
                // "low" é uma tentativa de meio termo, mas NÃO se mostrou
                // suficiente: com ele a geração ainda estourou os 180s. A causa
                // real é a dificuldade aritmética da tarefa (encaixar gramas de
                // 591 alimentos até fechar 4 macros ao mesmo tempo), e o
                // caminho é simplificar o problema, não ajustar este parâmetro.
                reasoning_effort: "none",
                // Os reasoning_tokens contam dentro deste limite.
                max_tokens: 32000,
            },
            // O `timeout` do cliente não basta: o SDK o cancela quando chegam os
            // cabeçalhos, e a geração acontece depois disso. Este sinal continua
            // valendo durante a leitura do corpo, então é ele que de fato limita.
            { signal: AbortSignal.timeout(this.timeoutMs) },
        );
    }

    /**
     * Geração em JSON mode. A temperatura é baixa de propósito: a fundamentação
     * teórica (4.2.3) trata a estocasticidade do LLM como problema em aplicações
     * que exigem resultados reprodutíveis e auditáveis.
     */
    async gerarJson(system: string, user: string): Promise<string> {
        // Sem estes logs, o console fica em silencio por ~1 min entre "plano
        // calculado" e o plano pronto, e nao da para distinguir "a IA esta
        // trabalhando" de "o backend travou".
        const caracteres = system.length + user.length;
        console.log(
            `[ia] conectando em ${this.model} — enviando prompt de ${caracteres} caracteres...`,
        );

        const inicio = Date.now();

        const resposta = await this.criarChatCompletion(system, user);

        const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
        const uso = resposta.usage;
        const raciocinio = uso?.completion_tokens_details?.reasoning_tokens ?? 0;

        // O tempo quase todo vai no raciocinio, entao ele aparece separado: e o
        // numero que explica a demora e o que muda ao trocar de modelo/modo.
        console.log(
            `[ia] resposta recebida em ${segundos}s — ${uso?.prompt_tokens ?? "?"} tokens de entrada, ` +
                `${uso?.completion_tokens ?? "?"} gerados (${raciocinio} de raciocinio)`,
        );

        const conteudo = resposta.choices[0]?.message?.content;

        // A própria doc da DeepSeek reconhece que o JSON mode pode devolver
        // conteúdo vazio ocasionalmente. O diagnóstico vai junto do erro porque a
        // causa mais comum é o raciocínio esgotar o max_tokens, e sem finish_reason
        // e usage não há como distinguir isso de uma falha do modelo.
        if (!conteudo || conteudo.trim() === "") {
            const motivo = resposta.choices[0]?.finish_reason ?? "desconhecido";
            const uso = JSON.stringify(resposta.usage ?? {});
            throw new Error(`A IA retornou uma resposta vazia (finish_reason=${motivo}, usage=${uso})`);
        }

        return conteudo;
    }

    /**
     * Mesma chamada de gerarJson (via criarChatCompletion — mesmos parâmetros
     * de produção), mas para o endpoint de benchmark
     * (src/services/BenchmarkGeracaoService.ts): não lança em resposta vazia
     * — devolve conteudo="" e deixa quem investiga decidir o que fazer — e
     * devolve as métricas cruas (usage, finish_reason, model, id) em vez de só
     * o texto, porque gerarJson descarta tudo isso depois de logar.
     */
    async gerarJsonComMetricas(system: string, user: string): Promise<RespostaLlmComMetricas> {
        const inicio = performance.now();
        const resposta = await this.criarChatCompletion(system, user);
        const llmMs = performance.now() - inicio;

        return {
            conteudo: resposta.choices[0]?.message?.content ?? "",
            finishReason: resposta.choices[0]?.finish_reason ?? null,
            modelo: resposta.model,
            respostaId: resposta.id,
            usage: resposta.usage as unknown as Record<string, unknown> | undefined,
            llmMs,
        };
    }
}
