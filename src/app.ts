import "dotenv/config"; // 1. Sempre o primeiro import
import express from "express";
import cors from "cors"; // 2. Import do CORS
import { env } from "./env";
import { logger } from "./infra/logger";
import { errorHandler } from "./middlewares/errorHandler";
import { routes } from "./routes";

// Workers
import "./workers/executionWorker";
import "./workers/paymentWorker";

export const app = express();

// 3. Configuração do CORS (DEVE vir antes das rotas)
app.use(cors({
  origin: "*", // Permite tudo (Frontend localhost, produção, etc)
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// 4. Rotas vêm DEPOIS do CORS
app.use(routes);

// 5. Error Handler por último
app.use(errorHandler);

if (env.NODE_ENV !== "test") {
  const port = env.PORT ?? 3000;
  app.listen(port, () => {
    logger.info({ port }, "HTTP server running");
  });
}