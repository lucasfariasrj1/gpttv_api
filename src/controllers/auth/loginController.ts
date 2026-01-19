import type { Request, Response } from "express";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const loginController = async (req: Request, res: Response): Promise<void> => {
  loginSchema.parse(req.body);

  res.status(200).json({
    message: "Login efetuado.",
  });
};
