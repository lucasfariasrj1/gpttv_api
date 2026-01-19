import type { Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../errors/AppError";
import { prisma } from "../../infra/database";
import { MonnifyService } from "../../services/payments/MonnifyService";

const monnifyWebhookSchema = z.object({
  eventType: z.string().optional(),
  eventData: z
    .object({
      paymentReference: z.string().optional(),
      transactionReference: z.string().optional(),
      metaData: z.record(z.string()).optional(),
    })
    .optional(),
});

export const monnifyWebhookController = async (req: Request, res: Response): Promise<void> => {
  const payload = monnifyWebhookSchema.parse(req.body);
  const metadata = payload.eventData?.metaData ?? {};
  const tenantId = metadata.tenant_id;
  const orderId = metadata.order_id;

  if (!tenantId || !orderId) {
    throw new AppError("Metadata do webhook incompleta.", 400);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  if (!tenant?.monnifyWebhookSecret) {
    throw new AppError("Tenant sem webhook secret configurado.", 400);
  }

  const signatureHeader = req.headers["x-monnify-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  MonnifyService.validateWebhookSignature(payload, signature, tenant.monnifyWebhookSecret);

  if (payload.eventType !== "transaction.successful") {
    res.status(200).json({ message: "Evento ignorado." });
    return;
  }

  const creditsAmount = Number(metadata.credits_amount ?? 0);

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
        paymentId: payload.eventData?.paymentReference ?? payload.eventData?.transactionReference ?? null,
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

  res.status(200).json({ message: "Pagamento confirmado e créditos liberados." });
};
