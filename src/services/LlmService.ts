import OpenAI from "openai";

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

    // Recebe uma função em vez do cliente pronto: o SDK exige a credencial já na
    // construção, então o cliente só é criado quando a IA é de fato usada.
    constructor(criarClient: () => OpenAI, model: string) {
        this.criarClient = criarClient;
        this.model = model;
    }

    async enviarMensagem(mensagem: string): Promise<string> {
        const resposta = await this.criarClient().chat.completions.create({
            model: this.model,
            messages: [{ role: "user", content: mensagem }],
        });

        return resposta.choices[0]?.message?.content ?? "";
    }

    /**
     * Geração em JSON mode. A temperatura é baixa de propósito: a fundamentação
     * teórica (4.2.3) trata a estocasticidade do LLM como problema em aplicações
     * que exigem resultados reprodutíveis e auditáveis.
     */
    async gerarJson(system: string, user: string): Promise<string> {
        const resposta = await this.criarClient().chat.completions.create({
            model: this.model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            // O V4-Pro é um modelo de raciocínio, e os reasoning_tokens contam
            // dentro deste limite. Montar um plano completo consome ~8k tokens só
            // de raciocínio: com um teto baixo, o raciocínio esgota a cota e a
            // resposta volta VAZIA em vez de truncada.
            max_tokens: 32000,
        });

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
}
