import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PAYMENT_ENCRYPTION_KEY: z.string().length(32),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(1),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  LOG_LEVEL: z.string().optional(),
});

export const env = envSchema.parse(process.env);
