import Redis from "ioredis";

type RedisGlobal = typeof globalThis & {
  redis?: Redis;
};

const globalForRedis = globalThis as RedisGlobal;

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
