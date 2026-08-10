import cors from "cors";
import express from "express";

import errorHandler from "./middlewares/errorHandler";
import notFoundHandler from "./middlewares/notFoundHandler";
import routes from "./routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "Hello from Bodia API"})
})

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
