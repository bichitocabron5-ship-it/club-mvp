/*
  Warnings:

  - A unique constraint covering the columns `[rfidCode]` on the table `Member` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "rfidCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Member_rfidCode_key" ON "Member"("rfidCode");
