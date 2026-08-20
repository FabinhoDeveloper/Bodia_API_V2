import OpenAI from "openai";

/**
 * Cliente de IA do BodIA: fala com o provider configurado em src/config/ia.ts
 * (hoje OpenAI, gpt-4o-mini) através do SDK da OpenAI.
 *
 * Não sabe QUAL provider está atrás: recebe cliente, modelo e timeout por
 * construtor. É o que permitiu trocar de provider três vezes sem tocar aqui.
 *
 * Não conhece treino, dieta nem nenhuma regra de negócio — só manda mensagem e
 * devolve texto (enviarMensagem) ou JSON (gerarJson). Todo o conteúdo enviado
 * já vem pronto dos prompts em src/prompts/.
 */
export default class AiService {
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
     * Um único lugar com os parâmetros da chamada — as três etapas da geração
     * passam por aqui, então nenhuma pode divergir das outras por descuido.
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
                // 8192 basta porque cada chamada faz UMA coisa: escolher
                // alimentos, calcular gramas de uma lista curta, ou montar o
                // treino. O teto anterior era 32000 por causa dos
                // reasoning_tokens da DeepSeek, que contavam dentro do limite.
                // Um modelo de chat não tem esse consumo, e o antigo valor só
                // escondia resposta grande demais em vez de barrá-la.
                max_tokens: 8192,
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
     *
     * `etapa` identifica qual das chamadas está em curso ("dieta:seleção",
     * "dieta:quantidades", "treino"). Sem ela o console mostra blocos idênticos
     * e não dá para saber qual etapa está lenta ou falhou — que é justamente a
     * pergunta que motivou dividir a geração em três.
     */
    async gerarJson(system: string, user: string, etapa: string): Promise<string> {
        const caracteres = system.length + user.length;
        console.log(
            `[ia:${etapa}] conectando em ${this.model} — prompt de ${caracteres} caracteres...`,
        );

        const inicio = Date.now();

        const resposta = await this.criarChatCompletion(system, user);

        const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
        const uso = resposta.usage;

        console.log(
            `[ia:${etapa}] resposta em ${segundos}s — ${uso?.prompt_tokens ?? "?"} tokens de entrada, ` +
                `${uso?.completion_tokens ?? "?"} gerados`,
        );

        const conteudo = resposta.choices[0]?.message?.content;

        // O diagnóstico vai junto do erro porque resposta vazia tem mais de uma
        // causa (filtro de conteúdo, teto de tokens, falha do modelo) e sem
        // finish_reason e usage não há como distinguir.
        if (!conteudo || conteudo.trim() === "") {
            const motivo = resposta.choices[0]?.finish_reason ?? "desconhecido";
            const uso = JSON.stringify(resposta.usage ?? {});
            throw new Error(
                `A IA retornou uma resposta vazia em ${etapa} (finish_reason=${motivo}, usage=${uso})`,
            );
        }

        return conteudo;
    }
}
