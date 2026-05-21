// app/api/members/by-rfid/[code]/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { normalizeRfidCode } from "@/lib/rfid";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { code } = await params;
  const cleanCode = normalizeRfidCode(code);

  if (!cleanCode) {
    return NextResponse.json({ error: "Codigo RFID invalido" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: {
      rfidCode: cleanCode,
    },
    select: {
      id: true,
      fullName: true,
      memberNumber: true,
      active: true,
      expiresAt: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Chapita no asignada" }, { status: 404 });
  }

  return NextResponse.json(member);
}
