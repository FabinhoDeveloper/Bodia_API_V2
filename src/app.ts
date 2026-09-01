import cors from "cors";
import express from "express";
import helmet from "helmet";

import { limiteGeral } from "./config/seguranca";
import { commit, iniciadoEm } from "./config/versao";
import errorHandler from "./middlewares/error-handler";
import notFoundHandler from "./middlewares/not-found-handler";
import routes from "./routes";

const app = express();

// A API roda atrás do nginx na EC2. Sem isto o express-rate-limit veria o IP do
// proxy em toda requisição e todos os usuários dividiriam a mesma cota — o
// primeiro a estourar derrubaria os outros. `1` = confia em UM proxy, o da
// frente; `true` confiaria na cadeia inteira, e aí qualquer cliente poderia
// forjar o próprio IP num X-Forwarded-For.
app.set("trust proxy", 1);

// Cabeçalhos de segurança (RNF11). A API só devolve JSON, então a CSP — feita
// para documento HTML — não tem o que proteger aqui e só atrapalharia se um dia
// algo for servido por esta porta.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(limiteGeral);

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
