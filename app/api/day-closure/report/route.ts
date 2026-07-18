import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth-server";
import {
  buildDailyClosureReport,
  buildDailyClosureReportCsv,
  isValidDayKey,
} from "@/lib/day-closure";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const day = req.nextUrl.searchParams.get("day")?.trim() || undefined;
  const format = req.nextUrl.searchParams.get("format")?.trim().toLowerCase();

  if (day && !isValidDayKey(day)) {
    return NextResponse.json({ error: "Dia invalido" }, { status: 400 });
  }

  const report = await buildDailyClosureReport(day);

  if (format === "csv") {
    const csv = buildDailyClosureReportCsv(report);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reporte-diario-${report.day}.csv"`,
      },
    });
  }

  return NextResponse.json(report);
}
