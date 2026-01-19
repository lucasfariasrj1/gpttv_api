import { Worker } from "bullmq";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/queue";
import { WarezService } from "../services/WarezService";

const warezService = new WarezService();

export const rechargeWorker = new Worker(
  "recharge-queue",
  async (job) => {
    const { transactionId, userId, targetUsername, amount } = job.data as {
      transactionId: string;
      userId: string;
      targetUsername: string;
      amount: number;
    };

    try {
      await warezService.rechargeReseller({
        target_username: targetUsername,
        amount,
      });

      await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: "COMPLETED" },
      });
    } catch (error) {
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
            userId,
            type: "REFUND",
            amount,
            description: "Refund after recharge failure",
            status: "COMPLETED",
          },
        });
      });

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5,
  },
);
