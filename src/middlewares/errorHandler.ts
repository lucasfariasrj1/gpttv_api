import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "../errors/AppError";
import { logger } from "../infra/logger";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error({ err: error }, "Unhandled error");

  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation error",
      errors: error.flatten(),
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    message: "Internal server error",
  });
};
