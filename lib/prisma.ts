import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { getDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
  connectionTimeoutMillis: 30_000,
  // Supabase session poolers have low per-project connection caps in production.
  // Keep the per-instance pool small to avoid exhausting the shared limit.
  max: 3,
  idleTimeoutMillis: 10000,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
