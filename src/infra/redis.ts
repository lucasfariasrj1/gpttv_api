import Redis from "ioredis";

import { env } from "../env";

type RedisGlobal = typeof globalThis & {
  redis?: Redis;
};

const globalForRedis = globalThis as RedisGlobal;

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
