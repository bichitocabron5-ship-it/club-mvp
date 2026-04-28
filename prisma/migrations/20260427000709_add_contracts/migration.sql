-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberContract" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "contractTemplateId" INTEGER NOT NULL,
    "signatureImage" TEXT NOT NULL,
    "signedPdfUrl" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberContract_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MemberContract" ADD CONSTRAINT "MemberContract_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberContract" ADD CONSTRAINT "MemberContract_contractTemplateId_fkey" FOREIGN KEY ("contractTemplateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
