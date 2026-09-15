import { Alimento } from "../data/alimentos";
import { PAPEIS_PROTEICOS, papelDe } from "../data/porcoes";
import DietaSelecaoPrompt from "../prompts/dieta-selecao.prompt";
import AiService from "../services/ai.service";
import { ResultadoCalculo } from "../types/perfil.types";
import { CorrecaoRefeicao, Refeicao, SelecaoDieta } from "../types/plano.types";
import PorcoesSolver from "./porcoes.solver";

/** Uma refeição já com os alimentos escolhidos na chamada 1. */
interface RefeicaoSelecionada {
    nome: string;
    alimentos: Alimento[];
}

/**
 * Uma refeição que a IA montou errado, e o que pedir a ela para consertar.
 *
 * `motivo` é para humano — vai para o log e, se o reparo não resolver, para a
 * conferência que o app exibe. `instrucao` é para o modelo, e fala de COMIDA,
 * não de aritmética: é a mesma escolha que `AjusteSelecao` faz com o desvio de
 * macros, pela mesma razão (pedir ao modelo a linguagem em que ele é bom).
 *
 * As frases não são compartilhadas com o `AjusteSelecao` de propósito: lá o
 * macro está FORA DA FAIXA e a instrução é de ajuste fino ("um carboidrato mais
 * denso além do que já escolheu"); aqui o papel está AUSENTE e a instrução é de
 * inclusão. Unificá-las produziria uma frase que não serve bem a nenhum dos dois.
 */
interface DefeitoSelecao {
    refeicao: string;
    motivo: string;
    instrucao: string;
}

/** O que a trilha da dieta devolve: as refeições e o que não deu para consertar. */
export interface DietaGerada {
    refeicoes: Refeicao[];
    /** Vazio quando tudo fechou. Uma linha por refeição que ficou defeituosa. */
    avisos: string[];
}

/**
 * As refeições em que a meta é grande demais para fechar sem uma base de
 * carboidrato e uma fonte de proteína. Lanche e ceia não entram: são pequenos e
 * uma fruta com iogurte já os resolve.
 *
 * Os nomes vêm de DISTRIBUICAO_REFEICOES, no engine.service.
 */
const REFEICOES_PRINCIPAIS = ["Almoço", "Jantar"];

/**
 * As duas etapas da dieta, em sequência:
 *
 *   1. SELEÇÃO   — quais alimentos entram em cada refeição (chamada à IA);
 *   2. PORÇÕES   — quantas gramas de cada um (determinístico, sem IA).
 *
 * A etapa 2 JÁ FOI uma chamada à IA, e foi por isso que um almoço saiu com 400 g
 * de arroz e um jantar com 500 g: o modelo recebia as quatro metas da refeição,
 * devolvia as gramas, e a única conferência era `gramas > 0`. Medido contra a
 * própria meta, o dia vinha 30% acima na caloria e 72% acima na proteína.
 * Dosar porções sob restrição é aritmética, não redação — o `PorcoesSolver`
 * resolve, dentro das faixas de `data/porcoes.ts`, e o resultado é o mesmo toda
 * vez.
 *
 * Sobra para o LLM o que ele faz bem: escolher itens plausíveis para uma
 * refeição brasileira. É a mesma divisão de trabalho que a fundamentação do
 * projeto defende entre o motor determinístico e o modelo — ela só não estava
 * sendo aplicada aqui.
 *
 * ## Seleção inválida vira RE-CHAMADA, não exceção
 *
 * Cada refeição é conferida antes de virar gramas, e uma que não passa é
 * **pedida de novo ao modelo**, sozinha, com o motivo da recusa junto.
 *
 * Antes cada conferência era um `throw`, e o efeito era desproporcional: um
 * almoço sem fonte de proteína — erro de UMA refeição, que o modelo conserta
 * quando avisado — derrubava a geração inteira com um 500, mesmo com o laço de
 * retry do `PlanoIaGenerator` de pé logo acima. O comentário de `exigirCobertura`
 * já dizia o certo ("o problema é da SELEÇÃO, e é ela que precisa ser refeita");
 * só faltava alguém refazê-la.
 *
 * Refaz-se **só a refeição culpada**, e não o dia: as outras já estavam boas, e
 * outra rodada completa gastaria uma chamada grande para arriscar estragá-las.
 *
 * Esgotados os reparos, a refeição imperfeita é ENTREGUE com um aviso. É a mesma
 * política do `PorcoesSolver` para meta inalcançável — prato comestível com
 * desvio honesto vale mais do que usuário sem plano —, e o desvio residual
 * ainda passa pelo `ValidadorMacros` lá em cima.
 */
export default class DietaIaGenerator {
    /**
     * Quantas vezes uma refeição defeituosa é pedida de novo.
     *
     * Duas, e não cinco como no laço de fora: aqui o pedido é bem mais estreito
     * ("este almoço não tem proteína, refaça só ele") e, se o modelo não atende
     * na segunda, o problema é do catálogo filtrado, não da instrução — insistir
     * só gasta tempo do orçamento do RNF02.
     */
    private static readonly MAX_REPAROS = 2;

    private readonly selecaoPrompt;
    private readonly aiService;
    private readonly porcoesSolver;

    constructor(
        selecaoPrompt: DietaSelecaoPrompt,
        aiService: AiService,
        porcoesSolver: PorcoesSolver,
    ) {
        this.selecaoPrompt = selecaoPrompt;
        this.aiService = aiService;
        this.porcoesSolver = porcoesSolver;
    }

    async gerar(
        resultado: ResultadoCalculo,
        alimentos: Alimento[],
        restricoesAlimentares: string[],
    ): Promise<DietaGerada> {
        const { selecionadas, avisos } = await this.selecionar(
            resultado,
            alimentos,
            restricoesAlimentares,
        );

        return { refeicoes: this.quantificar(resultado, selecionadas), avisos };
    }

    /**
     * Pede de novo, ao modelo, cada refeição cujos MACROS não fecharam — com a
     * seleção anterior dela junto — e devolve as versões novas já com gramas.
     *
     * Até aqui o retry do plano pedia a seleção do DIA inteiro de novo, numa
     * chamada sem memória. O prompt dizia "mantenha as demais" e "além do que já
     * escolheu", mas o modelo nunca recebia o que tinha escolhido: cada volta era
     * um sorteio novo, e as refeições que já estavam boas iam junto. Agora só a
     * refeição culpada volta ao modelo, e ele vê o prato que vai corrigir.
     *
     * Devolve SÓ as refeições que voltaram montáveis. Quem decide se a versão
     * nova é melhor que a anterior é o `PlanoIaGenerator`, que tem o validador:
     * a nova pode perfeitamente sair pior.
     *
     * As chamadas vão em `Promise.all` e a falha de cada uma é engolida, pela
     * mesma razão do reparo: um timeout aqui não pode deixar o usuário sem a
     * refeição que ele já tinha.
     */
    async reajustar(
        resultado: ResultadoCalculo,
        alimentos: Alimento[],
        restricoesAlimentares: string[],
        atuais: Refeicao[],
        correcoes: CorrecaoRefeicao[],
    ): Promise<Refeicao[]> {
        const porId = new Map(alimentos.map((a) => [a.id, a]));
        const atualPorNome = new Map(atuais.map((r) => [r.nome, r]));

        const respostas = await Promise.all(
            correcoes.map((correcao) =>
                this.pedirReajuste(correcao, atualPorNome.get(correcao.refeicao), {
                    resultado,
                    alimentos,
                    restricoesAlimentares,
                    porId,
                }),
            ),
        );

        const reajustadas = respostas.filter((r): r is RefeicaoSelecionada => r !== null);

        return this.quantificar(resultado, reajustadas);
    }

    /** CHAMADA 1 — devolve as refeições com os objetos Alimento já resolvidos. */
    private async selecionar(
        resultado: ResultadoCalculo,
        alimentos: Alimento[],
        restricoesAlimentares: string[],
    ): Promise<{ selecionadas: RefeicaoSelecionada[]; avisos: string[] }> {
        const { system, user } = this.selecaoPrompt.montar({
            resultado,
            alimentos,
            restricoesAlimentares,
        });

        const resposta = await this.aiService.gerarJson(system, user, "dieta:seleção");
        const selecao = this.parsearSelecao(resposta);

        const porId = new Map(alimentos.map((a) => [a.id, a]));
        const nomesEsperados = resultado.dieta.refeicoes.map((r) => r.nome);

        const selecionadas: RefeicaoSelecionada[] = [];
        const defeitos: DefeitoSelecao[] = [];

        for (const nome of nomesEsperados) {
            const escolhida = selecao.refeicoes.find((r) => r.nome === nome);
            const escolhidos = this.resolver(nome, escolhida?.alimentoIds ?? [], porId);

            selecionadas.push({ nome, alimentos: escolhidos });

            const defeito = this.conferir(nome, escolhidos);
            if (defeito) defeitos.push(defeito);
        }

        return this.reparar(selecionadas, defeitos, {
            resultado,
            alimentos,
            restricoesAlimentares,
            porId,
        });
    }

    /**
     * Os ids que a IA devolveu, virados em alimentos do catálogo.
     *
     * Id de fora do catálogo é DESCARTADO, e não motivo de exceção. O catálogo
     * já passou pelo `CatalogoFilter`, então um id que não está nele é
     * alucinação E, potencialmente, um item proibido para este usuário entrando
     * pela porta dos fundos — descartar mantém a barreira exatamente onde
     * estava, e ainda deixa a refeição recuperável. O que sobra é conferido por
     * `conferir`: se o descarte quebrou a cobertura, o defeito nasce ali.
     *
     * Ids repetidos viram o mesmo alimento duas vezes na refeição, e o solver
     * teria de dosar os dois — dedup aqui é mais simples.
     */
    private resolver(
        nome: string,
        ids: number[],
        porId: Map<number, Alimento>,
    ): Alimento[] {
        const escolhidos = new Map<number, Alimento>();
        const invalidos: number[] = [];

        for (const id of ids) {
            const alimento = porId.get(id);

            if (!alimento) {
                invalidos.push(id);
                continue;
            }

            escolhidos.set(alimento.id, alimento);
        }

        if (invalidos.length) {
            console.log(
                `[dieta] "${nome}": ${invalidos.length} id(s) fora do catálogo permitido, ` +
                    `descartado(s): ${invalidos.join(", ")}`,
            );
        }

        return [...escolhidos.values()];
    }

    /**
     * O que há de errado com uma refeição, ou `null` se ela está montável.
     *
     * Uma refeição principal precisa de base de carboidrato E de fonte de
     * proteína: sem as duas a meta é inalcançável por construção, e o solver
     * entregaria o prato possível com um desvio enorme — um almoço de 1000 kcal
     * montado só com legumes. Vale só para almoço e jantar; num lanche a meta é
     * pequena e fruta com iogurte a resolve.
     *
     * Refeição vazia é o caso que não depende de qual refeição é: sem alimento
     * nenhum não há prato, e a causa é a IA ter pulado a refeição ou ter
     * devolvido só ids inventados.
     */
    private conferir(nome: string, escolhidos: Alimento[]): DefeitoSelecao | null {
        if (!escolhidos.length) {
            return {
                refeicao: nome,
                motivo: "sem nenhum alimento válido",
                instrucao:
                    "Monte esta refeição do zero, combinando os grupos que ela pede e usando apenas ids da lista.",
            };
        }

        if (!REFEICOES_PRINCIPAIS.includes(nome)) return null;

        const papeis = escolhidos.map(papelDe);

        if (!papeis.includes("BASE_CARBO")) {
            return {
                refeicao: nome,
                motivo: "sem nenhuma base de carboidrato",
                instrucao:
                    "Inclua uma base de carboidrato — arroz, macarrão, batata, mandioca, farofa ou pão.",
            };
        }

        if (!papeis.some((papel) => PAPEIS_PROTEICOS.includes(papel))) {
            return {
                refeicao: nome,
                motivo: "sem nenhuma fonte de proteína",
                instrucao:
                    "Inclua uma fonte de proteína — carne, frango, peixe, ovo, queijo ou leguminosa.",
            };
        }

        return null;
    }

    /**
     * Pede de novo, ao modelo, cada refeição que não passou.
     *
     * As refeições defeituosas de uma rodada vão em `Promise.all`: são
     * independentes entre si, e o custo da rodada passa a ser o de UMA chamada
     * em vez do de uma por refeição — o que é o que mantém o reparo dentro do
     * orçamento de tempo do RNF02.
     *
     * O que volta só substitui a seleção original quando traz algum alimento
     * válido: uma resposta vazia deixaria a refeição pior do que estava.
     */
    private async reparar(
        selecionadas: RefeicaoSelecionada[],
        defeitos: DefeitoSelecao[],
        contexto: {
            resultado: ResultadoCalculo;
            alimentos: Alimento[];
            restricoesAlimentares: string[];
            porId: Map<number, Alimento>;
        },
    ): Promise<{ selecionadas: RefeicaoSelecionada[]; avisos: string[] }> {
        const porNome = new Map(selecionadas.map((r) => [r.nome, r]));
        let pendentes = defeitos;

        for (let rodada = 1; pendentes.length && rodada <= DietaIaGenerator.MAX_REPAROS; rodada++) {
            for (const defeito of pendentes) {
                console.log(
                    `[dieta] "${defeito.refeicao}" recusado: ${defeito.motivo} — ` +
                        `pedindo de novo (reparo ${rodada}/${DietaIaGenerator.MAX_REPAROS})`,
                );
            }

            const respostas = await Promise.all(
                pendentes.map((defeito) => this.pedirRefeicao(defeito, contexto)),
            );

            const restantes: DefeitoSelecao[] = [];

            for (const { nome, alimentos, defeito } of respostas) {
                if (alimentos.length) porNome.set(nome, { nome, alimentos });
                if (defeito) restantes.push(defeito);
            }

            pendentes = restantes;
        }

        // Entrega o que tem, com o problema declarado. O usuário nunca fica sem
        // plano por causa de uma refeição que o modelo não soube montar — e o
        // desvio que ela causa ainda aparece na conferência dos macros.
        const avisos = pendentes.map((d) => `${d.refeicao}: ${d.motivo}`);

        for (const aviso of avisos) {
            console.log(`[dieta] reparo esgotado — ${aviso}`);
        }

        return {
            selecionadas: selecionadas.map((r) => porNome.get(r.nome)!),
            avisos,
        };
    }

    /**
     * UMA refeição, pedida de novo com o motivo da recusa junto.
     *
     * A falha da chamada é engolida de propósito: um timeout no reparo devolve a
     * seleção original e o defeito continua pendente, em vez de derrubar a
     * dieta inteira por causa da tentativa de consertá-la. Quem já tinha um
     * prato imperfeito não pode acabar sem prato nenhum.
     */
    private async pedirRefeicao(
        defeito: DefeitoSelecao,
        contexto: {
            resultado: ResultadoCalculo;
            alimentos: Alimento[];
            restricoesAlimentares: string[];
            porId: Map<number, Alimento>;
        },
    ): Promise<{ nome: string; alimentos: Alimento[]; defeito: DefeitoSelecao | null }> {
        const nome = defeito.refeicao;

        const { system, user } = this.selecaoPrompt.montarReparo({
            resultado: contexto.resultado,
            alimentos: contexto.alimentos,
            restricoesAlimentares: contexto.restricoesAlimentares,
            refeicao: nome,
            motivo: defeito.motivo,
            instrucao: defeito.instrucao,
        });

        try {
            const resposta = await this.aiService.gerarJson(system, user, `dieta:reparo:${nome}`);
            const selecao = this.parsearSelecao(resposta);

            // A resposta traz uma refeição só; casar pelo nome ainda assim
            // protege contra o modelo devolver o dia inteiro por conta própria.
            const escolhida = selecao.refeicoes.find((r) => r.nome === nome) ?? selecao.refeicoes[0];
            const alimentos = this.resolver(nome, escolhida?.alimentoIds ?? [], contexto.porId);

            return { nome, alimentos, defeito: this.conferir(nome, alimentos) };
        } catch (erro) {
            const motivo = erro instanceof Error ? erro.message : String(erro);
            console.log(`[dieta] reparo de "${nome}" falhou — ${motivo}`);

            return { nome, alimentos: [], defeito };
        }
    }

    /**
     * UMA refeição, pedida de novo com a seleção anterior e a instrução junto.
     *
     * Devolve `null` — e a refeição fica como estava — quando a chamada falha ou
     * quando a resposta não é montável (vazia, ou um almoço que perdeu a base de
     * carboidrato). Trocar um prato com desvio por um prato impossível seria
     * piorar em nome de corrigir.
     */
    private async pedirReajuste(
        correcao: CorrecaoRefeicao,
        atual: Refeicao | undefined,
        contexto: {
            resultado: ResultadoCalculo;
            alimentos: Alimento[];
            restricoesAlimentares: string[];
            porId: Map<number, Alimento>;
        },
    ): Promise<RefeicaoSelecionada | null> {
        const nome = correcao.refeicao;
        const anteriores = (atual?.itens ?? [])
            .map((item) => contexto.porId.get(item.alimentoId))
            .filter((a): a is Alimento => a !== undefined);

        const { system, user } = this.selecaoPrompt.montarReajuste({
            resultado: contexto.resultado,
            alimentos: contexto.alimentos,
            restricoesAlimentares: contexto.restricoesAlimentares,
            refeicao: nome,
            anteriores,
            instrucao: correcao.instrucao,
        });

        try {
            const resposta = await this.aiService.gerarJson(system, user, `dieta:reajuste:${nome}`);
            const selecao = this.parsearSelecao(resposta);

            const escolhida = selecao.refeicoes.find((r) => r.nome === nome) ?? selecao.refeicoes[0];
            const alimentos = this.resolver(nome, escolhida?.alimentoIds ?? [], contexto.porId);
            const defeito = this.conferir(nome, alimentos);

            if (defeito) {
                console.log(`[dieta] reajuste de "${nome}" descartado: ${defeito.motivo}`);
                return null;
            }

            return { nome, alimentos };
        } catch (erro) {
            const motivo = erro instanceof Error ? erro.message : String(erro);
            console.log(`[dieta] reajuste de "${nome}" falhou — ${motivo}`);

            return null;
        }
    }

    /**
     * ETAPA 2 — as gramas, resolvidas pelo motor. Sem IA.
     *
     * Cada refeição é resolvida contra a SUA meta, e não contra a do dia: é a
     * repartição que `EngineService.calcularDieta` já produziu. Resolver o dia
     * inteiro de uma vez deixaria o solver livre para concentrar tudo numa
     * refeição só.
     *
     * O nome vem do catálogo, não do que a IA escreveu: assim o app nunca exibe
     * um nome que não corresponde ao id gravado.
     */
    private quantificar(
        resultado: ResultadoCalculo,
        refeicoes: RefeicaoSelecionada[],
    ): Refeicao[] {
        const metaPorNome = new Map(resultado.dieta.refeicoes.map((r) => [r.nome, r]));

        return refeicoes.map((selecionada) => {
            const meta = metaPorNome.get(selecionada.nome);

            // O nome saiu de resultado.dieta.refeicoes em `selecionar`, então a
            // meta existe. O guarda é contra a lista mudar de origem um dia.
            if (!meta) {
                throw new Error(`Sem meta calculada para a refeição "${selecionada.nome}"`);
            }

            const porId = new Map(selecionada.alimentos.map((a) => [a.id, a]));

            const itens = this.porcoesSolver
                .resolver(selecionada.alimentos, {
                    kcal: meta.kcal,
                    proteina: meta.proteina,
                    carboidrato: meta.carboidrato,
                    gordura: meta.gordura,
                })
                .map((porcao) => ({
                    alimentoId: porcao.alimentoId,
                    nome: porId.get(porcao.alimentoId)!.nome,
                    gramas: porcao.gramas,
                }));

            return { nome: selecionada.nome, itens };
        });
    }

    /**
     * Continua LANÇANDO, ao contrário das conferências por refeição: um JSON
     * quebrado não diz qual refeição consertar, e não há pedido estreito a
     * fazer. Quem trata é o laço de tentativas do `PlanoIaGenerator`, que gasta
     * uma volta e pede a seleção do dia de novo.
     */
    private parsearSelecao(resposta: string): SelecaoDieta {
        let selecao: SelecaoDieta;

        try {
            selecao = JSON.parse(resposta) as SelecaoDieta;
        } catch {
            throw new Error("A IA retornou um JSON inválido na seleção de alimentos");
        }

        if (!selecao.refeicoes?.length) {
            throw new Error("A IA retornou uma seleção sem refeições");
        }

        return selecao;
    }
}
