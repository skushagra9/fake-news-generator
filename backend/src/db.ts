import { PrismaClient } from "@prisma/client";

// Singleton Prisma client. Using a global guards against the dev-server
// hot-reload "too many connections" pitfall.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
