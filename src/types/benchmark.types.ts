/**
 * Tipos do endpoint temporário de benchmark (GET /api/teste-geracao).
 * Separados dos tipos de produção porque saem junto com o endpoint.
 */

import { PlanoGerado, Validacao } from "./plano.types";

/**
 * Retorno de gerarComMetricas. `sucesso: false` significa que a chamada à IA
 * em si falhou (rede/timeout/API); um plano que voltou mas não passou no parse
 * ou na validação ainda é `sucesso: true` — a chamada funcionou, o problema é
 * o conteúdo, e é exatamente isso que o benchmark quer conseguir distinguir.
 */
export interface ResultadoBenchmarkGeracao {
    sucesso: boolean;
    prepMs: number;
    llmMs: number;
    caracteresPrompt: number;
    modeloRespondido: string | null;
    respostaId: string | null;
    finishReason: string | null;
    usage: Record<string, unknown> | undefined;
    respostaCaracteres: number | null;
    respostaBytes: number | null;
    jsonValido: boolean;
    validacaoOk: boolean | null;
    validacao: Validacao | null;
    plano: PlanoGerado | null;
    erro: { tipo: string; mensagem: string } | null;
}

export interface RespostaLlmComMetricas {
    conteudo: string;
    finishReason: string | null;
    modelo: string;
    respostaId: string;
    // Objeto `usage` exatamente como o provider devolveu, sem filtrar pelos
    // campos que a lib da OpenAI documenta — a DeepSeek já expõe campos que
    // não existem no tipo oficial (ex.: prompt_cache_hit_tokens), e quem
    // consome isto (o benchmark) precisa ver o bruto.
    usage: Record<string, unknown> | undefined;
    llmMs: number;
}
