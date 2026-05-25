import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-server";
import { getClubSettings, upsertClubSettings } from "@/lib/club-settings";

const settingsSchema = z.object({
  dailyLimitG: z.number().positive(),
  dailyLimitUd: z.number().int().positive(),
  defaultMonthlyLimitG: z.number().int().positive(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(await getClubSettings());
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = settingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const settings = await upsertClubSettings(parsed.data);
  return NextResponse.json(settings);
}
