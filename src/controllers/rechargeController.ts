import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { rechargeQueue } from "../lib/queue";

const rechargeSchema = z.object({
  target_username: z.string().min(1),
  amount: z.number().positive(),
});

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: "ADMIN" | "RESELLER";
  };
}

export const requestRecharge = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const parsed = rechargeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid request",
      errors: parsed.error.flatten(),
    });
  }

  const { target_username, amount } = parsed.data;

  try {
    const transactionRecord = await prisma.$transaction(async (tx) => {
      const reseller = await tx.user.findUnique({
        where: { id: user.id },
        select: { balance: true },
      });

      if (!reseller) {
        throw new Error("User not found");
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
          userId: user.id,
          type: "SPEND",
          amount,
          description: `Recharge for ${target_username}`,
          status: "PENDING",
        },
      });
    });

    if (!transactionRecord) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    await rechargeQueue.add(
      "recharge",
      {
        transactionId: transactionRecord.id,
        userId: user.id,
        targetUsername: target_username,
        amount,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    );

    return res.status(202).json({
      status: "PROCESSING",
      transaction_id: transactionRecord.id,
    });
  } catch (error) {
    return res.status(500).json({ message: "Recharge request failed" });
  }
};
