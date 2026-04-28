-- CreateTable
CREATE TABLE "SigningSession" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "memberId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "signatureImage" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SigningSession_token_key" ON "SigningSession"("token");

-- AddForeignKey
ALTER TABLE "SigningSession" ADD CONSTRAINT "SigningSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
