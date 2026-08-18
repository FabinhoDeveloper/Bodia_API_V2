import { NextFunction, Request, Response } from "express";

import AutenticacaoError from "../errors/autenticacao.error";
import ConflitoError from "../errors/conflito.error";
import NaoEncontradoError from "../errors/nao-encontrado.error";
import ValidationError from "../errors/validation.error";

export default function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
    if (err instanceof ValidationError) {
        res.status(400).json({ message: err.message });
        return;
    }

    if (err instanceof AutenticacaoError) {
        res.status(401).json({ message: err.message });
        return;
    }

    if (err instanceof NaoEncontradoError) {
        res.status(404).json({ message: err.message });
        return;
    }

    if (err instanceof ConflitoError) {
        res.status(409).json({ message: err.message });
        return;
    }

    console.error(err);
    res.status(500).json({ message: "Internal server error" });
}
