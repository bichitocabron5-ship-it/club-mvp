// scripts/create-admin.ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

async function main() {
  const name = process.env.APP_ADMIN_NAME?.trim() || "Administrador";
  const email = requireEnv("APP_ADMIN_EMAIL");
  const password = requireEnv("APP_ADMIN_PASSWORD");

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.appUser.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      active: true,
    },
    create: {
      name,
      email,
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });

  console.log("Admin creado/actualizado:");
  console.log(email);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
