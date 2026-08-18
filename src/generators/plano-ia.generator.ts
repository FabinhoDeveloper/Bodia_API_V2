import { Alimento } from "../data/alimentos";
import { Exercicio } from "../data/exercicios";
import { ResultadoBenchmarkGeracao } from "../types/benchmark.types";
import { PerfilParaPlano, ResultadoCalculo } from "../types/perfil.types";
import {
    DesvioMacro,
    PlanoGerado,
    PlanoValidado,
    Validacao,
} from "../types/plano.types";
import CatalogoFilter from "../prompts/catalogo.filter";
import AiService from "../services/ai.service";
import PlanoPrompt from "../prompts/plano.prompt";

/**
 * Orquestra a geração do plano pela IA (chamado por OnboardingService, depois
 * que o EngineService já produziu o ResultadoCalculo) e é o ponto onde a
 * resposta do modelo é conferida, nunca aceita de graça:
 *
 *   1. CatalogoFilter filtra alimentos/exercícios pela restrição do usuário;
 *   2. PlanoPrompt monta { system, user } a partir do resultado + catálogos;
 *   3. AiService.gerarJson chama a DeepSeek e devolve o JSON como string;
 *   4. parsear() converte a string em PlanoGerado (erro se não for JSON válido
 *      ou faltar dieta/treino);
 *   5. validarIds() rejeita qualquer alimentoId/exercicioId que não exista no
 *      catálogo filtrado — alucinação de item;
 *   6. validarMacros() recalcula kcal/macros a partir da TACO (não confia no
 *      número que a IA disse) e mede o desvio contra a meta do
 *      EngineService — alucinação de número vira desvio medido, não erro
 *      silencioso.
 *
 * Só depois de passar pelas duas validações o { plano, validacao } volta para
 * quem chamou.
 */
export default class PlanoIaGenerator {
    // Limite de referência: a fundamentação teórica cita desvio calórico inferior
    // a 2% como o resultado alcançável combinando LLM e base nutricional
    // estruturada via prompt engineering (Khamesian apud SRIVASTAVA et al., 2025).
    private static readonly DESVIO_ACEITAVEL_PERCENTUAL = 5;

    private readonly catalogoFilter;
    private readonly planoPrompt;
    private readonly aiService;

    constructor(
        catalogoFilter: CatalogoFilter,
        planoPrompt: PlanoPrompt,
        aiService: AiService,
    ) {
        this.catalogoFilter = catalogoFilter;
        this.planoPrompt = planoPrompt;
        this.aiService = aiService;
    }

    async gerar(perfil: PerfilParaPlano, resultado: ResultadoCalculo): Promise<PlanoValidado> {
        const alimentos = this.catalogoFilter.filtrarAlimentos(perfil.restricoesAlimentares);
        const exercicios = this.catalogoFilter.filtrarExercicios(
            perfil.restricoesFisicas,
            resultado.treino.sessoes.map((sessao) => sessao.nome),
        );

        const { system, user } = this.planoPrompt.montar({
            resultado,
            alimentos,
            exercicios,
            restricoesAlimentares: perfil.restricoesAlimentares,
            restricoesFisicas: perfil.restricoesFisicas,
        });

        const resposta = await this.aiService.gerarJson(system, user);
        const plano = this.parsear(resposta);

        this.validarIds(plano, alimentos, exercicios);
        const validacao = this.validarMacros(plano, alimentos, resultado);

        return { plano, validacao };
    }

    /**
     * Mesmo caminho de gerar() — mesmo CatalogoFilter, mesmo PlanoPrompt,
     * mesmas validações privadas (parsear/validarIds/validarMacros) — só troca
     * aiService.gerarJson (que só devolve texto e lança em resposta vazia)
     * por gerarJsonComMetricas (que devolve usage/finish_reason/model e nunca
     * lança em resposta vazia). Não é chamado por gerar() nem pelo
     * OnboardingService; existe só para o endpoint de benchmark
     * (GET /api/teste-geracao, ver BenchmarkService).
     */
    async gerarComMetricas(
        perfil: PerfilParaPlano,
        resultado: ResultadoCalculo,
    ): Promise<ResultadoBenchmarkGeracao> {
        const inicioPrep = performance.now();
        const alimentos = this.catalogoFilter.filtrarAlimentos(perfil.restricoesAlimentares);
        const exercicios = this.catalogoFilter.filtrarExercicios(
            perfil.restricoesFisicas,
            resultado.treino.sessoes.map((sessao) => sessao.nome),
        );
        const { system, user } = this.planoPrompt.montar({
            resultado,
            alimentos,
            exercicios,
            restricoesAlimentares: perfil.restricoesAlimentares,
            restricoesFisicas: perfil.restricoesFisicas,
        });
        const prepMs = performance.now() - inicioPrep;
        const caracteresPrompt = system.length + user.length;

        const inicioLlm = performance.now();
        let llmResultado;
        try {
            llmResultado = await this.aiService.gerarJsonComMetricas(system, user);
        } catch (erro) {
            // Mesmo em erro/timeout, o tempo até a falha é justamente o dado
            // que o benchmark quer capturar — não descartar aqui.
            const llmMs = performance.now() - inicioLlm;
            return {
                sucesso: false,
                prepMs,
                llmMs,
                caracteresPrompt,
                modeloRespondido: null,
                respostaId: null,
                finishReason: null,
                usage: undefined,
                respostaCaracteres: null,
                respostaBytes: null,
                jsonValido: false,
                validacaoOk: null,
                validacao: null,
                plano: null,
                erro: {
                    tipo: erro instanceof Error ? erro.constructor.name : "Erro",
                    mensagem: erro instanceof Error ? erro.message : String(erro),
                },
            };
        }

        const { conteudo, usage, finishReason, modelo, respostaId, llmMs } = llmResultado;
        const respostaCaracteres = conteudo.length;
        const respostaBytes = Buffer.byteLength(conteudo, "utf8");

        let jsonValido = false;
        try {
            JSON.parse(conteudo);
            jsonValido = true;
        } catch {
            jsonValido = false;
        }

        let validacao: Validacao | null = null;
        let validacaoOk: boolean | null = null;
        let plano: PlanoGerado | null = null;
        let erroValidacao: { tipo: string; mensagem: string } | null = null;

        if (jsonValido) {
            try {
                // Atribui a `plano` antes de validarIds/validarMacros de propósito:
                // se a validação de ids falhar (alucinação), o plano parseado ainda
                // fica disponível na resposta do benchmark para inspeção.
                plano = this.parsear(conteudo);
                this.validarIds(plano, alimentos, exercicios);
                validacao = this.validarMacros(plano, alimentos, resultado);
                validacaoOk = validacao.dentroDoLimite;
            } catch (erro) {
                validacaoOk = false;
                erroValidacao = {
                    tipo: erro instanceof Error ? erro.constructor.name : "Erro",
                    mensagem: erro instanceof Error ? erro.message : String(erro),
                };
            }
        }

        return {
            sucesso: true,
            prepMs,
            llmMs,
            caracteresPrompt,
            modeloRespondido: modelo,
            respostaId,
            finishReason,
            usage,
            respostaCaracteres,
            respostaBytes,
            jsonValido,
            validacaoOk,
            validacao,
            plano,
            erro: erroValidacao,
        };
    }

    private parsear(resposta: string): PlanoGerado {
        let plano: PlanoGerado;

        try {
            plano = JSON.parse(resposta) as PlanoGerado;
        } catch {
            throw new Error("A IA retornou um JSON inválido");
        }

        if (!plano.dieta?.refeicoes?.length || !plano.treino?.sessoes?.length) {
            throw new Error("A IA retornou um plano sem dieta ou sem treino");
        }

        return plano;
    }

    /**
     * Todo id citado tem de existir no catálogo que foi enviado ao modelo. Um id
     * inexistente é alucinação — e, se o catálogo foi filtrado por restrição,
     * seria também um item proibido entrando pela porta dos fundos.
     */
    private validarIds(plano: PlanoGerado, alimentos: Alimento[], exercicios: Exercicio[]): void {
        const idsAlimentos = new Set(alimentos.map((a) => a.id));
        const idsExercicios = new Set(exercicios.map((e) => e.id));

        for (const refeicao of plano.dieta.refeicoes) {
            for (const item of refeicao.itens ?? []) {
                if (!idsAlimentos.has(item.alimentoId)) {
                    throw new Error(
                        `A IA citou um alimento fora do catálogo permitido (id ${item.alimentoId}, "${item.nome}")`,
                    );
                }
            }
        }

        for (const sessao of plano.treino.sessoes) {
            for (const exercicio of sessao.exercicios ?? []) {
                if (!idsExercicios.has(exercicio.exercicioId)) {
                    throw new Error(
                        `A IA citou um exercício fora do catálogo permitido (id ${exercicio.exercicioId}, "${exercicio.nome}")`,
                    );
                }
            }
        }
    }

    /**
     * Recalcula os totais da dieta a partir dos valores da TACO e das gramas que o
     * modelo propôs. O número final nunca é aceito na palavra do modelo.
     */
    private validarMacros(
        plano: PlanoGerado,
        alimentos: Alimento[],
        resultado: ResultadoCalculo,
    ): Validacao {
        const porId = new Map(alimentos.map((a) => [a.id, a]));
        const total = { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 };

        for (const refeicao of plano.dieta.refeicoes) {
            for (const item of refeicao.itens ?? []) {
                const alimento = porId.get(item.alimentoId)!;
                const fator = item.gramas / 100;

                total.kcal += alimento.kcal * fator;
                total.proteina += alimento.proteina * fator;
                total.carboidrato += alimento.carboidrato * fator;
                total.gordura += alimento.gordura * fator;
            }
        }

        const calorias = this.compararComMeta(resultado.meta.caloriasAlvo, total.kcal);
        const proteina = this.compararComMeta(resultado.macros.proteina.g, total.proteina);
        const carboidrato = this.compararComMeta(resultado.macros.carboidrato.g, total.carboidrato);
        const gordura = this.compararComMeta(resultado.macros.gordura.g, total.gordura);

        const dentroDoLimite = [calorias, proteina, carboidrato, gordura].every(
            (macro) => Math.abs(macro.desvioPercentual) <= PlanoIaGenerator.DESVIO_ACEITAVEL_PERCENTUAL,
        );

        return { calorias, proteina, carboidrato, gordura, dentroDoLimite };
    }

    private compararComMeta(meta: number, obtido: number): DesvioMacro {
        const arredondado = Math.round(obtido * 10) / 10;
        const desvioPercentual = meta === 0 ? 0 : ((arredondado - meta) / meta) * 100;

        return {
            meta,
            obtido: arredondado,
            desvioPercentual: Math.round(desvioPercentual * 10) / 10,
        };
    }
}
