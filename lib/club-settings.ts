import { prisma } from "@/lib/prisma";

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
