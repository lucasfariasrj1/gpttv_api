import type { Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../errors/AppError";
import { prisma } from "../infra/database";
import { executionQueue } from "../infra/queue";

const rechargeSchema = z.object({
  target_username: z.string().min(1),
  amount: z.coerce.number().positive(),
});

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: "ADMIN" | "RESELLER";
  };
}

export const requestRecharge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    throw new AppError("Unauthorized", 401);
  }

  const { target_username, amount } = rechargeSchema.parse(req.body);

  const transactionRecord = await prisma.$transaction(async (tx) => {
    const reseller = await tx.user.findUnique({
      where: { id: user.id },
      select: { balance: true, tenantId: true },
    });

    if (!reseller) {
      throw new AppError("User not found", 404);
    }

    if (reseller.balance.lessThan(amount)) {
      return null;
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });

    return tx.transaction.create({
      data: {
        tenantId: reseller.tenantId,
        userId: user.id,
        type: "SPEND",
        amount,
        description: `Recharge for ${target_username}`,
        status: "PENDING",
      },
    });
  });

  if (!transactionRecord) {
    throw new AppError("Insufficient balance", 400);
  }

  await executionQueue.add(
    "execute-recharge",
    {
      tenantId: transactionRecord.tenantId,
      targetUser: target_username,
      amount,
      transactionId: transactionRecord.id,
      userId: user.id,
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  );

  res.status(202).json({
    status: "PROCESSING",
    transaction_id: transactionRecord.id,
  });
};
