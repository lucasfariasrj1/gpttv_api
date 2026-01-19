import { Worker } from "bullmq";

import { AppError } from "../errors/AppError";
import { prisma } from "../infra/database";
import { redis } from "../infra/redis";
import { WarezService } from "../services/WarezService";
import { decryptValue } from "../services/security/encryption";

type ExecutionJobData = {
  tenantId: string;
  targetUser: string;
  amount: number;
  transactionId?: string;
  userId?: string;
};

const warezService = new WarezService();

export const executionWorker = new Worker<ExecutionJobData>(
  "execution-queue",
  async (job) => {
    const { tenantId, targetUser, amount, transactionId, userId } = job.data;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant?.warezUsername || !tenant.warezPassword) {
      throw new AppError("Credenciais Warez não configuradas para o tenant.", 400);
    }

    const username = decryptValue(tenant.warezUsername);
    const password = decryptValue(tenant.warezPassword);

    try {
      await warezService.rechargeReseller({
        tenantId,
        username,
        password,
        targetUser,
        amount,
      });

      if (transactionId) {
        await prisma.transaction.update({
          where: { id: transactionId },
          data: { status: "COMPLETED" },
        });
      }
    } catch (error) {
      if (transactionId && userId) {
        await prisma.$transaction(async (tx) => {
          await tx.transaction.update({
            where: { id: transactionId },
            data: { status: "FAILED" },
          });

          await tx.user.update({
            where: { id: userId },
            data: {
              balance: {
                increment: amount,
              },
            },
          });

          await tx.transaction.create({
            data: {
              tenantId,
              userId,
              type: "REFUND",
              amount,
              description: "Refund after recharge failure",
              status: "COMPLETED",
            },
          });
        });
      }

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5,
  },
);
