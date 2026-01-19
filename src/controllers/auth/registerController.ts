import type { Request, Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";

import { AppError } from "../../errors/AppError";
import { prisma } from "../../infra/database";

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  tenantSlug: z.string().min(1),
});

const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
};

export const registerController = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, tenantSlug } = registerSchema.parse(req.body);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant) {
    throw new AppError("Tenant não encontrado.", 404);
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      tenantId: tenant.id,
      email,
    },
  });

  if (existingUser) {
    throw new AppError("Email já cadastrado.", 409);
  }

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name,
      email,
      passwordHash: hashPassword(password),
    },
  });

  res.status(201).json({
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
  });
};
