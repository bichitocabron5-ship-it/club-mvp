import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Authorization requires a persisted positive INTEGER, never a display default.
// With a transaction, FOR SHARE holds the row against UPDATE/DELETE until commit.
// The existing settings upsert takes a conflicting row lock without API changes.
export async function getPersistedMonthlyLimitG(
  tx?: Prisma.TransactionClient
): Promise<number | null> {
  const settings = tx
    ? (await tx.$queryRaw<Array<{ defaultMonthlyLimitG: number }>>`
        SELECT "defaultMonthlyLimitG" FROM "ClubSetting" WHERE "id" = 1 FOR SHARE
      `)[0]
    : await prisma.clubSetting.findUnique({
        where: { id: 1 },
        select: { defaultMonthlyLimitG: true },
      });
  const value = settings?.defaultMonthlyLimitG;
  return typeof value === "number" && Number.isInteger(value) &&
    value > 0 && value <= 2_147_483_647 ? value : null;
}

export const DEFAULT_CLUB_SETTINGS = {
  dailyLimitG: 10,
  dailyLimitUd: 15,
  defaultMonthlyLimitG: 30,
} as const;

export type ClubSettings = {
  dailyLimitG: number;
  dailyLimitUd: number;
  defaultMonthlyLimitG: number;
};

export type ClubSettingsInput = {
  dailyLimitG?: number;
  dailyLimitUd?: number;
  defaultMonthlyLimitG?: number;
};

export async function getClubSettings(): Promise<ClubSettings> {
  const settings = await prisma.clubSetting.findUnique({
    where: { id: 1 },
  });

  if (!settings) {
    return { ...DEFAULT_CLUB_SETTINGS };
  }

  return {
    dailyLimitG: Number(settings.dailyLimitG),
    dailyLimitUd: Number(settings.dailyLimitUd),
    defaultMonthlyLimitG: Number(settings.defaultMonthlyLimitG),
  };
}

export async function upsertClubSettings(
  input: ClubSettingsInput
): Promise<ClubSettings> {
  const settings = await prisma.clubSetting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      dailyLimitG: input.dailyLimitG ?? DEFAULT_CLUB_SETTINGS.dailyLimitG,
      dailyLimitUd: input.dailyLimitUd ?? DEFAULT_CLUB_SETTINGS.dailyLimitUd,
      defaultMonthlyLimitG:
        input.defaultMonthlyLimitG ?? DEFAULT_CLUB_SETTINGS.defaultMonthlyLimitG,
    },
    update: {
      dailyLimitG: input.dailyLimitG,
      dailyLimitUd: input.dailyLimitUd,
      defaultMonthlyLimitG: input.defaultMonthlyLimitG,
    },
  });

  return {
    dailyLimitG: Number(settings.dailyLimitG),
    dailyLimitUd: Number(settings.dailyLimitUd),
    defaultMonthlyLimitG: Number(settings.defaultMonthlyLimitG),
  };
}
