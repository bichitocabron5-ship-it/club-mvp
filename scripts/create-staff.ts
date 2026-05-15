// scripts/create-staff.ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  const email = "staff@club.local";
  const password = "Staff1234!";

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.appUser.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "STAFF",
      active: true,
    },
    create: {
      name: "Staff Member",
      email,
      passwordHash,
      role: "STAFF",
      active: true,
    },
  });

  console.log("Staff member created:");
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