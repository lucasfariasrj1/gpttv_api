import type { Request, Response } from "express";

import { prisma } from "../../infra/prisma";
import { MercadoPagoGateway } from "../../services/payments/MercadoPagoGateway";

const gateway = new MercadoPagoGateway(
  process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "",
  process.env.MERCADO_PAGO_WEBHOOK_SECRET,
);

export const mercadoPagoWebhookController = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await gateway.handleWebhook(req.body, req.headers as Record<string, string | string[]>);

    if (result.status !== "PAID") {
      res.status(200).json({ message: "Pagamento não aprovado." });
      return;
    }

    const tenantId = result.metadata?.tenantId;
    const orderId = result.metadata?.orderId;
    const creditsAmount = Number(result.metadata?.creditsAmount ?? 0);

    if (!tenantId || !orderId) {
      res.status(400).json({ message: "Metadata incompleta no webhook." });
      return;
    }

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
          paymentId: result.paymentId,
        },
      });

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
    });

    res.status(200).json({ message: "Pagamento confirmado e créditos liberados." });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};
