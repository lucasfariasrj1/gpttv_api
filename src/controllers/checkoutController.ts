import type { Request, Response } from "express";

import { prisma } from "../infra/prisma";
import { MonnifyService } from "../services/payments/MonnifyService";
import { decryptValue } from "../services/security/encryption";

export const checkoutController = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantSlug = req.params.tenantSlug;
    const { productId, userId } = req.body as { productId?: string; userId?: string };

    if (!tenantSlug) {
      res.status(400).json({ message: "Tenant slug não informado." });
      return;
    }

    if (!productId || !userId) {
      res.status(400).json({ message: "Produto e usuário são obrigatórios." });
      return;
    }

    const tenant = req.tenant ?? (await prisma.tenant.findUnique({ where: { slug: tenantSlug } }));

    if (!tenant) {
      res.status(404).json({ message: "Tenant não encontrado." });
      return;
    }

    if (!tenant.monnifyToken) {
      res.status(400).json({ message: "Tenant sem token Monnify configurado." });
      return;
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        tenantId: tenant.id,
        active: true,
      },
    });

    if (!product) {
      res.status(404).json({ message: "Produto não encontrado." });
      return;
    }

    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        userId,
        totalAmount: product.price,
      },
    });

    const monnifyService = new MonnifyService(decryptValue(tenant.monnifyToken));

    const charge = await monnifyService.createCharge({
      amount: Number(product.price),
      type: "immediate",
      metadata: {
        tenant_id: tenant.id,
        order_id: order.id,
        user_id: userId,
        credits_amount: String(product.creditsAmount),
      },
    });

    res.status(200).json({
      orderId: order.id,
      charge,
    });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};
