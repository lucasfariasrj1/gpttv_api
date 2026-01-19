import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { AppError } from "../../errors/AppError";
import { env } from "../../env";
import { prisma } from "../../infra/database";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const loginController = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: { email },
  });

  if (!user) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      tenantId: user.tenantId,
    },
    env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );

  res.status(200).json({
    message: "Login realizado com sucesso",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance,
    },
  });
};
