-- DropForeignKey
ALTER TABLE "MemberContract" DROP CONSTRAINT "MemberContract_contractTemplateId_fkey";

-- AlterTable
ALTER TABLE "MemberContract" ALTER COLUMN "contractTemplateId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "MemberContract" ADD CONSTRAINT "MemberContract_contractTemplateId_fkey" FOREIGN KEY ("contractTemplateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
