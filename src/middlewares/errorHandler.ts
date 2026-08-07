import { NextFunction, Request, Response } from "express";

import AutenticacaoError from "../errors/AutenticacaoError";
import ConflitoError from "../errors/ConflitoError";
import NaoEncontradoError from "../errors/NaoEncontradoError";
import ValidationError from "../errors/ValidationError";

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
