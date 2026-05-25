CREATE TABLE "ClubSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "dailyLimitG" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "dailyLimitUd" INTEGER NOT NULL DEFAULT 15,
    "defaultMonthlyLimitG" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ClubSetting" ("id", "dailyLimitG", "dailyLimitUd", "defaultMonthlyLimitG")
VALUES (1, 10, 15, 30)
ON CONFLICT ("id") DO NOTHING;
