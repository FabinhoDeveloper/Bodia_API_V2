import OpenAI from "openai";

/**
 * Cliente do provider de IA.
 *
 * O arquivo se chama `ia.ts`, e não `openai.ts`, abrindo exceção deliberada à
 * convenção `config/<provider>.ts` do CLAUDE.md: o projeto trocou de provider
 * três vezes (DeepSeek → Gemini → OpenAI) em uma semana. O provider virou valor
 * de CONFIGURAÇÃO, não identidade do código — trocar de novo é editar o .env.
 * (`prisma.ts` continua seguindo a regra original, porque o banco não é
 * intercambiável do mesmo jeito.)
 *
 * O que torna isso possível é o SDK da OpenAI aceitar `baseURL`: DeepSeek e
 * Gemini expõem endpoints compatíveis com a interface Chat Completions, então
 * o mesmo cliente serve os três.
 */

let client: OpenAI | null = null;

/**
 * Modelo usado nas três chamadas.
 *
 * Fica no topo do arquivo, e não junto das outras exportações, porque o teto de
 * tempo e os parâmetros da chamada são DERIVADOS dele — precisa estar
 * inicializado antes.
 */
export const iaModel = process.env.IA_MODEL || "gpt-4o-mini";

/**
 * Um modelo de raciocínio (gpt-5, o1, o3, o4) pensa antes de responder, e isso
 * muda tanto os parâmetros que ele aceita quanto o tempo de cada chamada. Os
 * dois ajustes estão logo abaixo (`iaTimeoutMs`, `iaParametros`).
 *
 * O prefixo `gpt-5` cobre a linha inteira — `gpt-5-mini`, `gpt-5-nano` — de
 * propósito: trocar de modelo dentro da família continua sendo editar o .env.
 */
export function ehModeloDeRaciocinio(model: string): boolean {
    return /^(gpt-5|o[1-9])/.test(model);
}

/**
 * Teto POR CHAMADA, não do conjunto — a geração são três chamadas curtas
 * (seleção de alimentos, quantidades e treino).
 *
 * Quem manda no orçamento é a trilha da dieta: seleção e quantidades rodam em
 * SEQUÊNCIA (a segunda recebe o que a primeira escolheu), enquanto o treino
 * corre em paralelo e se esconde atrás delas. Então o pior caso é 2 × o teto:
 *
 *   chat (60s)      → 120s
 *   raciocínio (90s) → 180s
 *
 * Os dois cabem nos 210s de timeout do axios no app, que é o número que
 * importa: o backend precisa falhar ANTES, senão o app desiste sozinho e o
 * usuário nunca vê o erro do servidor. 90s é o máximo seguro — 100s já levaria
 * o pior caso a 200s, folga pequena demais para rede e persistência.
 *
 * ATENÇÃO: o `timeout` do SDK NÃO basta sozinho. Ele é limpo assim que os
 * cabeçalhos da resposta chegam, e a geração acontece depois disso — foi assim
 * que uma chamada durou 328s com o teto em 180s. Por isso o AiService também
 * passa um AbortSignal por requisição, que continua valendo durante a leitura
 * do corpo. É esse sinal que aparece como `APIUserAbortError` quando estoura
 * (o teto do SDK daria `APIConnectionTimeoutError`).
 */
export const iaTimeoutMs = ehModeloDeRaciocinio(iaModel) ? 90000 : 60000;

/**
 * Parâmetros da chamada, prontos para o AiService espalhar no `create`.
 *
 * Ficam AQUI, e não no AiService, por duas razões. A primeira é a regra do
 * CLAUDE.md: valor de configuração necessário em outra camada é passado como
 * parâmetro, não lido lá dentro. A segunda é o que o AiService promete no
 * próprio cabeçalho — não saber qual modelo está atrás. Se ele decidisse os
 * parâmetros por regex sobre o nome do modelo, essa promessa deixaria de valer.
 *
 * Modelo de chat leva `temperature: 0.2` (a fundamentação 4.2.3 trata a
 * estocasticidade como problema de reprodutibilidade) e `max_tokens: 8192` —
 * basta porque cada chamada faz UMA coisa: escolher alimentos, calcular gramas
 * de uma lista curta, ou montar o treino.
 *
 * Modelo de raciocínio rejeita os dois: exige `max_completion_tokens` e só
 * aceita a temperatura padrão. Abrir mão da temperatura baixa é o custo real de
 * usar essa família — é escolha consciente, não detalhe de configuração.
 *
 * `reasoning_effort: "minimal"` é o modo mais rápido do gpt-5, e não `"low"`:
 * as três etapas produzem JSON de estrutura fixa, onde raciocínio longo gasta
 * tempo e tokens sem melhorar o resultado. Foi com esforço maior que a etapa de
 * quantidades estourou o teto de 60s.
 *
 * O teto de saída é maior no raciocínio porque os reasoning_tokens contam
 * DENTRO dele — mesmo motivo que obrigava a 32000 na época da DeepSeek. Com
 * 8192 o modelo gasta o orçamento pensando e devolve conteúdo vazio com
 * finish_reason=length.
 */
export const iaParametros = ehModeloDeRaciocinio(iaModel)
    ? { max_completion_tokens: 24576, reasoning_effort: "minimal" as const }
    : { temperature: 0.2, max_tokens: 8192 };

// O SDK repete a chamada 2x por padrão. Numa requisição que consome crédito,
// repetir automaticamente triplica custo e espera — falhar rápido e deixar o
// usuário decidir se tenta de novo é melhor.
const MAX_RETRIES = 0;

/**
 * Endpoint do provider. Vazio (o normal) significa OpenAI: o SDK usa o próprio
 * padrão. Preencher só para apontar a um provider compatível — por exemplo
 * `https://api.deepseek.com` ou
 * `https://generativelanguage.googleapis.com/v1beta/openai/`.
 *
 * CUIDADO: esta variável decide para onde a sua chave é enviada. Um valor
 * errado entrega a credencial ao host errado. Só aponte para provider confiável.
 */
function baseUrlConfigurada(): string | undefined {
    // `|| undefined` e não o valor cru: string vazia quebra a resolução do
    // endpoint no SDK, em vez de cair no padrão como se esperaria.
    return process.env.IA_BASE_URL || undefined;
}

// O SDK valida a credencial já no construtor. Criar o cliente sob demanda evita
// que a falta da chave derrube o servidor inteiro no boot — sem a chave, só a
// rota que usa a IA falha, e com uma mensagem que diz o que fazer.
export function getIaClient(): OpenAI {
    if (!client) {
        const apiKey = process.env.IA_API_KEY;

        if (!apiKey) {
            throw new Error("IA_API_KEY não configurada — defina a chave em backend/.env");
        }

        client = new OpenAI({
            apiKey,
            baseURL: baseUrlConfigurada(),
            timeout: iaTimeoutMs,
            maxRetries: MAX_RETRIES,
        });
    }

    return client;
}

/**
 * Quando true, a rota usa o PlanoSimuladoGenerator em vez de chamar a IA.
 *
 * Continua ligada por padrão: mesmo com a geração dividida em três chamadas,
 * desenvolver o resto do produto sem depender de rede e de crédito é o que
 * torna a suíte e o dia a dia rápidos. Desligue com SIMULAR_IA=false para
 * exercitar o caminho real.
 */
export const simularIa = (process.env.SIMULAR_IA ?? "true").toLowerCase() !== "false";
