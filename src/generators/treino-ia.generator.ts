import { Exercicio } from "../data/exercicios";
import TreinoPrompt from "../prompts/treino.prompt";
import AiService from "../services/ai.service";
import { ResultadoCalculo } from "../types/perfil.types";
import { SessaoTreino } from "../types/plano.types";

/** O que a chamada 3 devolve: as sessões e uma orientação livre. */
export interface TreinoGerado {
    sessoes: SessaoTreino[];
    observacoes?: string;
}

/**
 * CHAMADA 3: o treino, sozinho.
 *
 * Não depende da dieta, então o PlanoIaGenerator dispara os dois em paralelo —
 * é o que impede que dividir a geração em três chamadas saia mais lento do que
 * a chamada única que existia antes.
 */
export default class TreinoIaGenerator {
    private readonly treinoPrompt;
    private readonly aiService;

    constructor(treinoPrompt: TreinoPrompt, aiService: AiService) {
        this.treinoPrompt = treinoPrompt;
        this.aiService = aiService;
    }

    async gerar(
        resultado: ResultadoCalculo,
        exercicios: Exercicio[],
        restricoesFisicas: string[],
    ): Promise<TreinoGerado> {
        const { system, user } = this.treinoPrompt.montar({
            resultado,
            exercicios,
            restricoesFisicas,
        });

        const resposta = await this.aiService.gerarJson(system, user, "treino");
        const treino = this.parsear(resposta);

        this.validarIds(treino, exercicios);

        return treino;
    }

    private parsear(resposta: string): TreinoGerado {
        let treino: TreinoGerado;

        try {
            treino = JSON.parse(resposta) as TreinoGerado;
        } catch {
            throw new Error("A IA retornou um JSON inválido no treino");
        }

        if (!treino.sessoes?.length) {
            throw new Error("A IA retornou um treino sem sessões");
        }

        return treino;
    }

    /**
     * Todo id citado tem de existir no catálogo que foi enviado. Id inexistente
     * é alucinação — e, como o catálogo passou pelo CatalogoFilter, seria também
     * um exercício contraindicado pela lesão do usuário entrando pela porta dos
     * fundos.
     */
    private validarIds(treino: TreinoGerado, exercicios: Exercicio[]): void {
        const permitidos = new Set(exercicios.map((e) => e.id));

        for (const sessao of treino.sessoes) {
            for (const exercicio of sessao.exercicios ?? []) {
                if (!permitidos.has(exercicio.exercicioId)) {
                    throw new Error(
                        `A IA citou um exercício fora do catálogo permitido (id ${exercicio.exercicioId}, "${exercicio.nome}")`,
                    );
                }
            }
        }
    }
}
