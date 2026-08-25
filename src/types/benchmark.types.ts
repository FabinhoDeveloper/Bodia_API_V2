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
    /**
     * Wall clock das trilhas — `max(dieta, treino)`, não a soma, porque elas
     * rodam em paralelo aqui como em produção. É o número que decide se o modelo
     * cabe nos 210s de timeout do axios no app.
     */
    llmMs: number;
    /**
     * Tempo de cada trilha. Elas se sobrepõem no relógio, então a soma das
     * etapas é MAIOR que `llmMs` — o que cada uma responde é "onde o tempo é
     * gasto", pergunta que motivou dividir a geração em três chamadas.
     *
     * Ordem fixa (dieta, treino), não ordem de término. Em falha, `ms` é o tempo
     * até o erro daquela trilha.
     */
    etapas: EtapaBenchmark[];
    jsonValido: boolean;
    validacaoOk: boolean | null;
    validacao: Validacao | null;
    plano: PlanoGerado | null;
    erro: { tipo: string; mensagem: string } | null;
}
