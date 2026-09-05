import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { getDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getRuntimeDatabaseUrl() {
  const connectionString = getDatabaseUrl();
  const url = new URL(connectionString);

  if (url.hostname.toLowerCase().endsWith(".pooler.supabase.com")) {
    // node-postgres currently treats sslmode=require as verify-full unless
    // libpq compatibility is explicitly enabled. Supabase Session Pooler
    // presents a certificate chain that fails that stricter verification on
    // Vercel, while libpq's `require` semantics still enforce encrypted TLS.
    url.searchParams.set("uselibpqcompat", "true");
    return url.toString();
  }

  return connectionString;
}

const adapter = new PrismaPg({
  connectionString: getRuntimeDatabaseUrl(),
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
