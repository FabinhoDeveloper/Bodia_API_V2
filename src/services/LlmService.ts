import OpenAI from "openai";

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
}
