// scripts/create-admin.ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  const email = "admin@club.local";
  const password = "Admin1234!";

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.appUser.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      active: true,
    },
    create: {
      name: "Administrador",
      email,
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });

  console.log("Admin creado:");
  console.log(email);
  console.log(password);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });