ALTER TABLE "AppUser"
ADD COLUMN "memberId" INTEGER;

CREATE UNIQUE INDEX "AppUser_memberId_key" ON "AppUser"("memberId");

ALTER TABLE "AppUser"
ADD CONSTRAINT "AppUser_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "Member"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
