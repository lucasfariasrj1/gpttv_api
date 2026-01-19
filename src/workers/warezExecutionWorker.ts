import axios from "axios";
import { Worker } from "bullmq";

import { prisma } from "../infra/prisma";
import { redis } from "../infra/redis";

const WAREZ_AUTH_CACHE_PREFIX = "warez:token:";
const WAREZ_AUTH_TTL_SECONDS = 3600;

type WarezJobData = {
  tenantId: string;
  userId: string;
  orderId: string;
  creditsAmount: number;
  payload: Record<string, string | number | boolean>;
};

const getWarezToken = async (tenantId: string, username: string, password: string) => {
  const cacheKey = `${WAREZ_AUTH_CACHE_PREFIX}${tenantId}`;
  const cachedToken = await redis.get(cacheKey);

  if (cachedToken) {
    return cachedToken;
  }

  const response = await axios.post(`${process.env.WAREZ_API_URL}/auth/login`, {
    username,
    password,
  });

  const token = response.data?.token as string | undefined;

  if (!token) {
    throw new Error("Token Warez não retornado.");
  }

  await redis.set(cacheKey, token, "EX", WAREZ_AUTH_TTL_SECONDS);

  return token;
};

export const warezExecutionWorker = new Worker<WarezJobData>(
  "warez-execution-queue",
  async (job) => {
    const { tenantId, userId, orderId, creditsAmount, payload } = job.data;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant || !tenant.warezUsername || !tenant.warezPassword) {
      throw new Error("Credenciais Warez não configuradas para o tenant.");
    }

    const token = await getWarezToken(tenantId, tenant.warezUsername, tenant.warezPassword);

    await axios.post(
      `${process.env.WAREZ_API_URL}/recharge`,
      {
        ...payload,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: {
          id: userId,
          tenantId,
        },
      });

      if (!user) {
        throw new Error("Usuário não encontrado para débito.");
      }

      if (user.balance < creditsAmount) {
        throw new Error("Saldo insuficiente para concluir a recarga.");
      }

      await tx.user.update({
        where: {
          id: userId,
          tenantId,
        },
        data: {
          balance: { decrement: creditsAmount },
        },
      });

      await tx.transaction.create({
        data: {
          orderId,
          type: "CREDIT_OUT",
        },
      });
    });
  },
  {
    connection: redis,
  },
);
