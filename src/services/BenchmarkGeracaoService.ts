import { PerfilOnboardingInput } from "../types/perfil.types";
import { PlanoGerado, Validacao } from "../types/plano.types";
import CalculoService from "./CalculoService";
import PlanoService from "./PlanoService";

export interface TokensBenchmark {
    prompt: number | null;
    completion: number | null;
    reasoning: number | null;
    cached: number | null;
    total: number | null;
}

export interface RespostaBenchmark {
    success: boolean;
    modelo: string | null;
    tempo: {
        total_ms: number;
        preparacao_ms: number;
        llm_ms: number;
    };
    tokens: TokensBenchmark;
    finish_reason: string | null;
    // Objeto usage exatamente como a DeepSeek devolveu — ver LlmService
    // .gerarJsonComMetricas. Fica aqui para conferir campo por campo o que o
    // provider realmente manda, sem depender do que este endpoint decidiu
    // extrair em `tokens`.
    usage_raw: Record<string, unknown> | null;
    resposta_id: string | null;
    resposta: {
        caracteres: number | null;
        bytes: number | null;
        json_valido: boolean;
        validacao_ok: boolean | null;
        // Desvio por macro (meta vs. obtido) que embasa validacao_ok — null
        // quando o plano nem chegou a ser parseado (json_valido: false).
        validacao: Validacao | null;
        // O plano tal como a IA devolveu, já convertido de JSON. Fica presente
        // mesmo que validacao_ok seja false (ex.: id alucinado) — é útil
        // justamente para inspecionar o que a IA tentou montar.
        plano: PlanoGerado | null;
    } | null;
    erro: { tipo: string; mensagem: string } | null;
}

// Perfil fixo e determinístico — não vem de parâmetro nenhum. Sem restrição
// alimentar/física para que o catálogo enviado ao prompt seja o maior
// possível (o mesmo tamanho de catálogo que o pior caso do app real usaria).
const PERFIL_FICTICIO: PerfilOnboardingInput = {
    sexo: "M",
    dataNascimento: "2001-03-10", // ~25 anos
    peso: 80,
    altura: 180,
    percentualGordura: 18,
    nivelAtividade: "moderado",
    nivelExperiencia: "intermediario",
    objetivo: "perder", // perda de gordura / recomposição
    diasPorSemana: 4,
    numeroRefeicoes: 4,
    restricoesAlimentares: [],
    restricoesFisicas: [],
};

/**
 * Orquestrador do benchmark de geração (GET /api/teste-geracao). Isolado do
 * fluxo real do app: usa CalculoService e PlanoService (os mesmos das
 * produção, injetados por construtor como qualquer outro service), mas com
 * um perfil fictício fixo em vez do payload de /api/onboarding, e chama
 * PlanoService.gerarComMetricas em vez de gerar() — método que existe só
 * para isto e não é usado em nenhum caminho de produção.
 *
 * Não altera CalculoService, CatalogoService nem PromptService: usa
 * exatamente a versão de produção de cada um.
 */
export default class BenchmarkGeracaoService {
    private readonly calculoService;
    private readonly planoService;
    private readonly modeloConfigurado;

    constructor(calculoService: CalculoService, planoService: PlanoService, modeloConfigurado: string) {
        this.calculoService = calculoService;
        this.planoService = planoService;
        this.modeloConfigurado = modeloConfigurado;
    }

    async executar(): Promise<RespostaBenchmark> {
        const inicioTotal = performance.now();
        console.log("[benchmark] início");
        console.log(`[benchmark] modelo requisitado: ${this.modeloConfigurado}`);

        const inicioCalculo = performance.now();
        const resultado = this.calculoService.calcular(PERFIL_FICTICIO);
        const calculoMs = performance.now() - inicioCalculo;

        console.log("[benchmark] chamada LLM iniciada");

        const resultadoGeracao = await this.planoService.gerarComMetricas(
            {
                restricoesAlimentares: PERFIL_FICTICIO.restricoesAlimentares,
                restricoesFisicas: PERFIL_FICTICIO.restricoesFisicas,
            },
            resultado,
        );

        console.log(`[benchmark] chamada LLM finalizada: ${resultadoGeracao.llmMs.toFixed(1)} ms`);

        const usage = resultadoGeracao.usage ?? null;
        const tokens = this.extrairTokens(usage);
        const preparacaoMs = calculoMs + resultadoGeracao.prepMs;
        const totalMs = performance.now() - inicioTotal;

        console.log(`[benchmark] preparação: ${preparacaoMs.toFixed(1)} ms`);
        console.log(`[benchmark] prompt tokens: ${tokens.prompt}`);
        console.log(`[benchmark] completion tokens: ${tokens.completion}`);
        console.log(`[benchmark] reasoning tokens: ${tokens.reasoning}`);
        console.log(`[benchmark] total tokens: ${tokens.total}`);
        console.log(`[benchmark] finish reason: ${resultadoGeracao.finishReason ?? "null"}`);
        console.log(`[benchmark] json válido: ${resultadoGeracao.jsonValido}`);
        console.log(`[benchmark] validação ok: ${resultadoGeracao.validacaoOk}`);
        console.log(`[benchmark] tempo total: ${totalMs.toFixed(1)} ms`);
        // Log do objeto usage bruto — só ele diz com certeza quais campos a
        // DeepSeek realmente devolveu hoje (ex.: se cached_tokens existe ou não).
        console.log("[benchmark] usage bruto:", JSON.stringify(usage));
        if (resultadoGeracao.erro) {
            console.log(
                `[benchmark] erro: ${resultadoGeracao.erro.tipo} — ${resultadoGeracao.erro.mensagem}`,
            );
        }

        return {
            success: resultadoGeracao.sucesso,
            modelo: resultadoGeracao.modeloRespondido,
            tempo: {
                total_ms: this.arredondar(totalMs),
                preparacao_ms: this.arredondar(preparacaoMs),
                llm_ms: this.arredondar(resultadoGeracao.llmMs),
            },
            tokens,
            finish_reason: resultadoGeracao.finishReason,
            usage_raw: usage,
            resposta_id: resultadoGeracao.respostaId,
            resposta: resultadoGeracao.sucesso
                ? {
                      caracteres: resultadoGeracao.respostaCaracteres,
                      bytes: resultadoGeracao.respostaBytes,
                      json_valido: resultadoGeracao.jsonValido,
                      validacao_ok: resultadoGeracao.validacaoOk,
                      validacao: resultadoGeracao.validacao,
                      plano: resultadoGeracao.plano,
                  }
                : null,
            erro: resultadoGeracao.erro,
        };
    }

    // Só lê os campos que o SDK documenta (prompt_tokens, completion_tokens,
    // total_tokens, completion_tokens_details.reasoning_tokens,
    // prompt_tokens_details.cached_tokens — ver node_modules/openai/resources
    // /completions.d.ts, interface CompletionUsage). Qualquer campo ausente
    // vira null; nada aqui é estimado ou calculado.
    private extrairTokens(usage: Record<string, unknown> | null): TokensBenchmark {
        const completionDetails = usage?.completion_tokens_details as Record<string, unknown> | undefined;
        const promptDetails = usage?.prompt_tokens_details as Record<string, unknown> | undefined;

        return {
            prompt: this.numeroOuNulo(usage?.prompt_tokens),
            completion: this.numeroOuNulo(usage?.completion_tokens),
            reasoning: this.numeroOuNulo(completionDetails?.reasoning_tokens),
            cached: this.numeroOuNulo(promptDetails?.cached_tokens),
            total: this.numeroOuNulo(usage?.total_tokens),
        };
    }

    private numeroOuNulo(valor: unknown): number | null {
        return typeof valor === "number" ? valor : null;
    }

    private arredondar(ms: number): number {
        return Math.round(ms * 10) / 10;
    }
}
