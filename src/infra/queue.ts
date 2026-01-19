import { Queue } from "bullmq";

import { redis } from "./redis";

export const executionQueue = new Queue("execution-queue", {
  connection: redis,
});

export const paymentQueue = new Queue("payment-queue", {
  connection: redis,
});
