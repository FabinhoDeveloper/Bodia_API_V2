/**
 * Tipos do endpoint temporário de benchmark (GET /api/teste-geracao).
 * Separados dos tipos de produção porque saem junto com o endpoint.
 */

import { PlanoGerado, Validacao } from "./plano.types";

export interface EtapaBenchmark {
    /** "dieta" (seleção + quantidades) ou "treino". */
    nome: string;
    ms: number;
    sucesso: boolean;
}

/**
 * Retorno de gerarComMetricas. `sucesso: false` significa que a chamada à IA
 * em si falhou (rede/timeout/API); um plano que voltou mas não passou no parse
 * ou na validação ainda é `sucesso: true` — a chamada funcionou, o problema é
 * o conteúdo, e é exatamente isso que o benchmark quer conseguir distinguir.
 */
export interface ResultadoBenchmarkGeracao {
    sucesso: boolean;
    prepMs: number;
    /** Soma das etapas. Em produção elas rodam em paralelo e o total é menor. */
    llmMs: number;
    /**
     * Tempo de cada trilha, medido em SEQUÊNCIA de propósito — é o que responde
     * "onde o tempo é gasto", pergunta que motivou dividir a geração em três
     * chamadas. Em paralelo os tempos se sobrepõem e o dado se perde.
     */
    etapas: EtapaBenchmark[];
    jsonValido: boolean;
    validacaoOk: boolean | null;
    validacao: Validacao | null;
    plano: PlanoGerado | null;
    erro: { tipo: string; mensagem: string } | null;
}
