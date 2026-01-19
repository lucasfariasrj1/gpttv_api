import crypto from "node:crypto";

import { Prisma, PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
};

const ADMIN_TENANT_SLUG = "admin-platform";

const seedAdminTenant = async (): Promise<void> => {
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: ADMIN_TENANT_SLUG },
  });

  if (existingTenant) {
    return;
  }

  await prisma.tenant.create({
    data: {
      name: "Plataforma Mestre",
      slug: ADMIN_TENANT_SLUG,
      brandColor: "#000000",
      users: {
        create: {
          name: "Admin",
          email: "admin@gpttv.com",
          passwordHash: hashPassword("admin"),
          role: UserRole.ADMIN,
          balance: new Prisma.Decimal(999999),
        },
      },
    },
  });
};

const main = async (): Promise<void> => {
  await seedAdminTenant();
};

main()
  .catch((error) => {
    console.error("Seed error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
