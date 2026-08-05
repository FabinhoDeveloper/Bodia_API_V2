import { NextFunction, Request, Response } from "express";

import ValidationError from "../errors/ValidationError";

export default function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
    if (err instanceof ValidationError) {
        res.status(400).json({ message: err.message });
        return;
    }

    console.error(err);
    res.status(500).json({ message: "Internal server error" });
}
