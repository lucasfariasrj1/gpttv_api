import type { Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../errors/AppError";
import { prisma } from "../../infra/database";
import { MonnifyService } from "../../services/payments/MonnifyService";
import { encryptValue } from "../../services/security/encryption";

const MONNIFY_WEBHOOK_URL = "https://api.suaplataforma.com/webhooks/monnify";

const configPaymentSchema = z.object({
  tenantId: z.string().min(1),
  monnifyToken: z.string().min(1),
});

export const configPaymentController = async (req: Request, res: Response): Promise<void> => {
  const { tenantId, monnifyToken } = configPaymentSchema.parse(req.body);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  if (!tenant) {
    throw new AppError("Tenant não encontrado.", 404);
  }

  const encryptedToken = encryptValue(monnifyToken);
  const webhookSecret = MonnifyService.generateWebhookSecret(tenant.id);
  const monnifyService = new MonnifyService(monnifyToken);

  await monnifyService.setupWebhook({
    url: MONNIFY_WEBHOOK_URL,
    secret: webhookSecret,
    events: ["transaction.successful", "transaction.failed"],
    status: "enabled",
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      monnifyToken: encryptedToken,
      monnifyWebhookSecret: webhookSecret,
    },
  });

  res.status(200).json({ message: "Configuração Monnify atualizada com sucesso." });
};
