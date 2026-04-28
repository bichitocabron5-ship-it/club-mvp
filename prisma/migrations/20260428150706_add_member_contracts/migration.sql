/*
  Warnings:

  - A unique constraint covering the columns `[signingSessionId]` on the table `MemberContract` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dni` to the `MemberContract` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `MemberContract` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MemberContract" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "consumptionGrams" INTEGER,
ADD COLUMN     "dni" TEXT NOT NULL,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "signingSessionId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "MemberContract_signingSessionId_key" ON "MemberContract"("signingSessionId");

-- AddForeignKey
ALTER TABLE "MemberContract" ADD CONSTRAINT "MemberContract_signingSessionId_fkey" FOREIGN KEY ("signingSessionId") REFERENCES "SigningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
