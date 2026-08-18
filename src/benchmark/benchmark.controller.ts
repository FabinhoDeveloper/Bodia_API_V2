import { Request, Response } from "express";

import BenchmarkService from "./benchmark.service";

/**
 * Ponte HTTP do benchmark de geração (GET /api/teste-geracao). Não usa
 * `.catch(next)` como os outros controllers: BenchmarkService.executar
 * já não lança em falha de IA (devolve `success: false` com o erro descrito
 * no corpo — ver PlanoIaGenerator.gerarComMetricas), então só chega aqui uma
 * falha realmente inesperada, e para essa o endpoint de benchmark precisa
 * devolver tempo/erro estruturados, não o `{ message }` genérico do
 * errorHandler global.
 */
export default class BenchmarkController {
    private readonly benchmarkService;

    constructor(benchmarkService: BenchmarkService) {
        this.benchmarkService = benchmarkService;
    }

    testarGeracao = (_req: Request, res: Response) => {
        const inicioTotal = performance.now();

        this.benchmarkService
            .executar()
            .then((resultado) => res.json(resultado))
            .catch((erro: unknown) => {
                const tempoTotalMs = Math.round((performance.now() - inicioTotal) * 10) / 10;
                console.error("[benchmark] erro inesperado:", erro);

                res.status(500).json({
                    success: false,
                    erro: {
                        tipo: erro instanceof Error ? erro.constructor.name : "Erro",
                        mensagem: erro instanceof Error ? erro.message : String(erro),
                    },
                    tempo_total_ms: tempoTotalMs,
                    usage: null,
                });
            });
    };
}
