import { NextFunction, Request, Response } from "express";

import { interpretarDia } from "../config/fuso";
import ValidationError from "../errors/validation.error";
import HidratacaoService from "../services/hidratacao.service";

/**
 * Ponte HTTP da hidratação. Sem regra de negócio: a validação do volume e o
 * recorte do dia moram no service.
 *
 * O usuarioId vem do corpo/URL porque ainda não há JWT. É a mesma limitação do
 * GET /api/plano, mas PIOR: lá se lê plano alheio, aqui se ESCREVE e se APAGA
 * no histórico alheio. Some quando a autenticação real entrar e o id passar a
 * sair do token.
 */
export default class HidratacaoController {
    private readonly hidratacaoService;

    constructor(hidratacaoService: HidratacaoService) {
        this.hidratacaoService = hidratacaoService;
    }

    // O Express 4 não encaminha rejeições de Promise para o errorHandler sozinho.
    registrar = (req: Request, res: Response, next: NextFunction) => {
        const { usuarioId, volumeMl } = req.body ?? {};

        this.hidratacaoService
            .registrar(usuarioId, volumeMl)
            .then((resumo) => res.status(201).json(resumo))
            .catch(next);
    };

    /**
     * `?dia=AAAA-MM-DD` é opcional — sem ele, hoje. O parse fica aqui porque é
     * leitura de query string, não regra: o service recebe um Date pronto.
     */
    buscar = (req: Request, res: Response, next: NextFunction) => {
        const { dia } = req.query;

        let instante = new Date();

        if (typeof dia === "string") {
            const interpretado = interpretarDia(dia);

            if (!interpretado) {
                next(new ValidationError("dia deve estar no formato AAAA-MM-DD"));
                return;
            }

            instante = interpretado;
        }

        this.hidratacaoService
            .doDia(req.params.usuarioId, instante)
            .then((resumo) => res.json(resumo))
            .catch(next);
    };

    remover = (req: Request, res: Response, next: NextFunction) => {
        this.hidratacaoService
            .remover(req.params.usuarioId, req.params.registroId)
            .then((resumo) => res.json(resumo))
            .catch(next);
    };
}
