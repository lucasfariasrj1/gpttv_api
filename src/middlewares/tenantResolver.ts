import type { NextFunction, Request, Response } from "express";

import { prisma } from "../infra/prisma";
import { redis } from "../infra/redis";

const TENANT_CACHE_PREFIX = "tenant:slug:";
const TENANT_CACHE_TTL_SECONDS = 300;

export const resolveTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const tenantSlug = req.params.tenantSlug;

  if (!tenantSlug) {
    res.status(400).json({ message: "Tenant slug não informado." });
    return;
  }

  const cacheKey = `${TENANT_CACHE_PREFIX}${tenantSlug}`;
  const cachedTenant = await redis.get(cacheKey);

  if (cachedTenant) {
    req.tenant = JSON.parse(cachedTenant);
    next();
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant) {
    res.status(404).json({ message: "Tenant não encontrado." });
    return;
  }

  await redis.set(cacheKey, JSON.stringify(tenant), "EX", TENANT_CACHE_TTL_SECONDS);
  req.tenant = tenant;
  next();
};
