import { Request, Response } from "express";

export default function notFoundHandler(req: Request, res: Response) {
    res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
}
