import type { Request, Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";

import { AppError } from "../../errors/AppError";
import { prisma } from "../../infra/database";

const createTenantSchema = z.object({
  tenantName: z.string().min(1),
  tenantSlug: z.string().min(1),
  ownerName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(1).optional(),
});

const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
};

export const createTenantController = async (req: Request, res: Response): Promise<void> => {
  const { tenantName, tenantSlug, ownerName, email, password } = createTenantSchema.parse(req.body);

  const { tenant, owner } = await prisma.$transaction(async (tx) => {
    const existingTenant = await tx.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (existingTenant) {
      throw new AppError("Slug já cadastrado.", 400);
    }

    const existingUser = await tx.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      throw new AppError("Email já cadastrado.", 400);
    }

    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        slug: tenantSlug,
      },
    });

    const owner = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: ownerName,
        email,
        passwordHash: hashPassword(password),
        role: "ADMIN",
        balance: 0,
      },
    });

    return { tenant, owner };
  });

  res.status(201).json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      brandColor: tenant.brandColor,
    },
    owner: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      role: owner.role,
    },
  });
};
