import type { Request, Response } from "express";

import { prisma } from "../../infra/prisma";
import { MonnifyService } from "../../services/payments/MonnifyService";

type MonnifyWebhookPayload = {
  eventType?: string;
  eventData?: {
    paymentReference?: string;
    transactionReference?: string;
    metaData?: Record<string, string>;
  };
};

export const monnifyWebhookController = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body as MonnifyWebhookPayload;
    const metadata = payload.eventData?.metaData ?? {};
    const tenantId = metadata.tenant_id;
    const orderId = metadata.order_id;

    if (!tenantId || !orderId) {
      res.status(400).json({ message: "Metadata do webhook incompleta." });
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant?.monnifyWebhookSecret) {
      res.status(400).json({ message: "Tenant sem webhook secret configurado." });
      return;
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
        throw new Error("Pedido não encontrado para o tenant informado.");
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
            orderId: order.id,
            type: "CREDIT_IN",
          },
        });
      }
    });

    res.status(200).json({ message: "Pagamento confirmado e créditos liberados." });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};
