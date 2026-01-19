import type { Request, Response } from "express";

import { prisma } from "../../infra/prisma";
import { MonnifyService } from "../../services/payments/MonnifyService";
import { encryptValue } from "../../services/security/encryption";

const MONNIFY_WEBHOOK_URL = "https://api.suaplataforma.com/webhooks/monnify";

export const configPaymentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenantId, monnifyToken } = req.body as { tenantId?: string; monnifyToken?: string };

    if (!tenantId || !monnifyToken) {
      res.status(400).json({ message: "Tenant e token Monnify são obrigatórios." });
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) {
      res.status(404).json({ message: "Tenant não encontrado." });
      return;
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
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};
