import { NextFunction, Request, Response } from "express";

import { interpretarDia, janelaDaSemana } from "../config/fuso";
import ValidationError from "../errors/validation.error";
import { usuarioAutenticado } from "../middlewares/autenticacao";
import TreinoService from "../services/treino.service";
import { Periodo } from "../types/registro.types";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Ponte HTTP do treino executado. Sem regra de negócio: a posse da sessão, a
 * validação das séries e as somas moram no service.
 *
 * O usuarioId sai do TOKEN, como nos demais registros.
 */
export default class TreinoController {
    private readonly treinoService;

    constructor(treinoService: TreinoService) {
        this.treinoService = treinoService;
    }

    // O Express 4 não encaminha rejeições de Promise para o errorHandler sozinho.
    abrir = (req: Request, res: Response, next: NextFunction) => {
        const { sessaoTreinoId } = req.body ?? {};

        this.treinoService
            .abrir(usuarioAutenticado(req), sessaoTreinoId)
            .then((treino) => res.status(201).json(treino))
            .catch(next);
    };

    concluir = (req: Request, res: Response, next: NextFunction) => {
        const { series } = req.body ?? {};

        this.treinoService
            .concluir(usuarioAutenticado(req), req.params.registroTreinoId, series)
            .then((resumo) => res.json(resumo))
            .catch(next);
    };

    /**
     * `?de=&ate=` são opcionais — sem eles, a semana corrente, que é o que a
     * TreinoScreen precisa para marcar os cards. Com eles, o histórico (RF27).
     *
     * O parse fica aqui porque é leitura de query string, não regra: o service
     * recebe um Periodo pronto.
     */
    consultar = (req: Request, res: Response, next: NextFunction) => {
        let periodo: Periodo;

        try {
            periodo = this.lerPeriodo(req);
        } catch (erro) {
            next(erro);
            return;
        }

        this.treinoService
            .consultar(usuarioAutenticado(req), periodo)
            .then((resumo) => res.json(resumo))
            .catch(next);
    };

    private lerPeriodo(req: Request): Periodo {
        const { de, ate } = req.query;

        if (typeof de !== "string" && typeof ate !== "string") {
            return janelaDaSemana(new Date());
        }

        // Um sozinho seria ambíguo — "de 10/03 até quando?" —, e adivinhar o
        // outro devolveria silenciosamente um período que ninguém pediu.
        if (typeof de !== "string" || typeof ate !== "string") {
            throw new ValidationError("de e ate devem ser informados juntos");
        }

        const inicio = interpretarDia(de);
        const fim = interpretarDia(ate);

        if (!inicio || !fim) {
            throw new ValidationError("de e ate devem estar no formato AAAA-MM-DD");
        }

        if (fim.getTime() < inicio.getTime()) {
            throw new ValidationError("ate não pode ser anterior a de");
        }

        // `ate` chega INCLUSIVO do app ("até o dia 20") e vira exclusivo aqui,
        // que é o que as consultas usam. Sem o dia somado, o último dia pedido
        // ficaria de fora e ninguém notaria até faltar um treino no histórico.
        return { de: inicio, ate: new Date(fim.getTime() + MS_POR_DIA) };
    }
}
