import type { Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../errors/AppError";
import { prisma } from "../../infra/database";
import { MercadoPagoGateway } from "../../services/payments/MercadoPagoGateway";

const gateway = new MercadoPagoGateway(
  process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "",
  process.env.MERCADO_PAGO_WEBHOOK_SECRET,
);

const mercadoPagoWebhookSchema = z.object({}).passthrough();

export const mercadoPagoWebhookController = async (req: Request, res: Response): Promise<void> => {
  const payload = mercadoPagoWebhookSchema.parse(req.body);
  const result = await gateway.handleWebhook(payload, req.headers as Record<string, string | string[]>);

  if (result.status !== "PAID") {
    res.status(200).json({ message: "Pagamento não aprovado." });
    return;
  }

  const tenantId = result.metadata?.tenantId;
  const orderId = result.metadata?.orderId;
  const creditsAmount = Number(result.metadata?.creditsAmount ?? 0);

  if (!tenantId || !orderId) {
    throw new AppError("Metadata incompleta no webhook.", 400);
  }

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
        tenantId,
        userId: order.userId,
        orderId: order.id,
        type: "CREDIT_IN",
        amount: creditsAmount,
        status: "COMPLETED",
      },
    });
  });

  res.status(200).json({ message: "Pagamento confirmado e créditos liberados." });
};
