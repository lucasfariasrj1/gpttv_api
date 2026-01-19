import "dotenv/config";
import cors from "cors";
import express from "express";
import { env } from "./env";
import { logger } from "./infra/logger";
import { errorHandler } from "./middlewares/errorHandler";
import { routes } from "./routes";
import "./workers/executionWorker";
import "./workers/paymentWorker";

export const app = express();

app.use(
  cors({
    origin: "*",
  }),
);
app.use(express.json());
app.use(routes);
app.use(errorHandler);

if (env.NODE_ENV !== "test") {
  const port = env.PORT ?? 3000;
  app.listen(port, () => {
    logger.info({ port }, "HTTP server running");
  });
}
