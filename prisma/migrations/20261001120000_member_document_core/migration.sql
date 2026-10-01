-- Additive core only: no legacy reads, backfill or Storage operations.
CREATE TABLE "MemberDocument" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER NOT NULL,

    CONSTRAINT "MemberDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberDocument_memberId_createdAt_idx" ON "MemberDocument"("memberId", "createdAt");

ALTER TABLE "MemberDocument" ADD CONSTRAINT "MemberDocument_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "MemberDocument" ADD CONSTRAINT "MemberDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
