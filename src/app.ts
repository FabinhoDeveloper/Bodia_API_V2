import cors from "cors";
import express from "express";

import { commit, iniciadoEm } from "./config/versao";
import errorHandler from "./middlewares/error-handler";
import notFoundHandler from "./middlewares/not-found-handler";
import routes from "./routes";

const app = express();

app.use(cors());
app.use(express.json());

// Alem de dizer que a API responde, a raiz diz QUAL versao esta respondendo:
// depois de um deploy, `commit` tem que bater com o commit publicado. Sem isso
// um `curl /` que volta 200 nao distingue deploy novo de processo antigo no ar.
app.get("/", (_req, res) => {
    res.json({ message: "BodIA API no ar", commit, iniciadoEm });
});

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
