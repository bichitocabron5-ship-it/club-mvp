CREATE TABLE "DashboardPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "defaultTab" TEXT NOT NULL DEFAULT 'summary',
    "widgetOrder" JSONB NOT NULL,
    "hiddenWidgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DashboardPreference_userId_key" ON "DashboardPreference"("userId");

ALTER TABLE "DashboardPreference"
ADD CONSTRAINT "DashboardPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "AppUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
