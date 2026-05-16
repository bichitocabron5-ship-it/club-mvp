// scripts/create-staff.ts
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
  const name = process.env.APP_STAFF_NAME?.trim() || "Staff Member";
  const email = requireEnv("APP_STAFF_EMAIL");
  const password = requireEnv("APP_STAFF_PASSWORD");

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.appUser.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "STAFF",
      active: true,
    },
    create: {
      name,
      email,
      passwordHash,
      role: "STAFF",
      active: true,
    },
  });

  console.log("Staff creado/actualizado:");
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
