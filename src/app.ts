import cors from "cors";
import express from "express";

import errorHandler from "./middlewares/error-handler";
import notFoundHandler from "./middlewares/not-found-handler";
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
