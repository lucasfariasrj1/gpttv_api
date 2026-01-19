import { Worker } from "bullmq";

import { AppError } from "../errors/AppError";
import { prisma } from "../infra/database";
import { redis } from "../infra/redis";

type PaymentJobData = {
  tenantId: string;
  orderId: string;
  paymentId?: string;
  creditsAmount: number;
};

export const paymentWorker = new Worker<PaymentJobData>(
  "payment-queue",
  async (job) => {
    const { tenantId, orderId, paymentId, creditsAmount } = job.data;

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          tenantId,
        },
      });

      if (!order) {
        throw new AppError("Pedido não encontrado para o tenant informado.", 404);
      }

      if (order.status === "PAID") {
        return;
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paymentId: paymentId ?? order.paymentId,
        },
      });

      if (creditsAmount > 0) {
        await tx.user.update({
          where: {
            id: order.userId,
            tenantId,
          },
          data: {
            balance: { increment: creditsAmount },
          },
        });

        await tx.transaction.create({
          data: {
            tenantId,
            userId: order.userId,
            orderId: order.id,
            type: "CREDIT_IN",
            amount: creditsAmount,
            status: "COMPLETED",
          },
        });
      }
    });
  },
  {
    connection: redis,
  },
);
