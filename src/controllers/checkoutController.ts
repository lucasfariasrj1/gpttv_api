import type { Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../errors/AppError";
import { prisma } from "../infra/database";
import { MonnifyService } from "../services/payments/MonnifyService";
import { decryptValue } from "../services/security/encryption";

const checkoutParamsSchema = z.object({
  tenantSlug: z.string().min(1),
});

const checkoutBodySchema = z.object({
  productId: z.string().min(1),
  userId: z.string().min(1),
});

export const checkoutController = async (req: Request, res: Response): Promise<void> => {
  const { tenantSlug } = checkoutParamsSchema.parse(req.params);
  const { productId, userId } = checkoutBodySchema.parse(req.body);

  const tenant = req.tenant ?? (await prisma.tenant.findUnique({ where: { slug: tenantSlug } }));

  if (!tenant) {
    throw new AppError("Tenant não encontrado.", 404);
  }

  if (!tenant.monnifyToken) {
    throw new AppError("Tenant sem token Monnify configurado.", 400);
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      tenantId: tenant.id,
      active: true,
    },
  });

  if (!product) {
    throw new AppError("Produto não encontrado.", 404);
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId: tenant.id,
    },
  });

  if (!user) {
    throw new AppError("Usuário não encontrado.", 404);
  }

  const order = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      productId: product.id,
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
      user_id: user.id,
      credits_amount: String(product.creditsAmount),
    },
  });

  res.status(200).json({
    orderId: order.id,
    charge,
  });
};
