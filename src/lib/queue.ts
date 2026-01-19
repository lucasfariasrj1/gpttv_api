import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const rechargeQueue = new Queue("recharge-queue", {
  connection: redis,
});
