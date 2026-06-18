// app/api/members/by-rfid/[code]/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { normalizeRfidCode } from "@/lib/rfid";
import { resolveStorageUrlForResponse } from "@/lib/storage";
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
  const includePhoto = new URL(req.url).searchParams.get("includePhoto") === "1";

  if (!cleanCode) {
    return NextResponse.json({ error: "Codigo RFID invalido" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: {
      rfidCode: cleanCode,
    },
    select: {
      id: true,
      memberNumber: true,
      fullName: true,
      dni: true,
      photoUrl: true,
      active: true,
      expiresAt: true,
      rfidCode: true,
      accessLogs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          memberId: true,
          type: true,
          createdAt: true,
        },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Chapita no asignada" }, { status: 404 });
  }

  const lastAccess = member.accessLogs[0] ?? null;

  return NextResponse.json({
    id: member.id,
    memberNumber: member.memberNumber,
    displayNumber: member.memberNumber ?? String(member.id),
    fullName: member.fullName,
    dni: member.dni,
    photoUrl: includePhoto
      ? await resolveStorageUrlForResponse(member.photoUrl, {
          context: "api/members/by-rfid/[code]",
        })
      : null,
    hasPhoto: Boolean(member.photoUrl),
    active: member.active,
    expiresAt: member.expiresAt?.toISOString() ?? null,
    rfidCode: member.rfidCode,
    lastAccess: lastAccess
      ? {
          id: lastAccess.id,
          memberId: lastAccess.memberId,
          type: lastAccess.type,
          createdAt: lastAccess.createdAt.toISOString(),
        }
      : null,
  });
}
