import "dotenv/config";
import express from "express";
import cors from "cors"; // <--- Importante: Deve estar aqui
import { env } from "./env";
import { logger } from "./infra/logger";
import { errorHandler } from "./middlewares/errorHandler";
import { routes } from "./routes";

// IMPORTANTE: Se tiver workers, importe aqui para eles rodarem
import "./workers/executionWorker";
import "./workers/paymentWorker";

export const app = express();

// Configuração do CORS
app.use(cors({
  origin: "*", // Permite acesso de qualquer lugar (ajuste em produção)
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(routes);
app.use(errorHandler);

if (env.NODE_ENV !== "test") {
  const port = env.PORT ?? 3000;
  app.listen(port, () => {
    logger.info({ port }, "HTTP server running");
  });
}