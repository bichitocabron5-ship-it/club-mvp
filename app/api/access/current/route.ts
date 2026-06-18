// app/api/access/current/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { getCurrentInsideMembers } from "@/lib/access";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const inside = await getCurrentInsideMembers();
  const insideWithoutPhotos = inside.map((member) => ({
    ...member,
    photoUrl: null,
    hasPhoto: Boolean(member.photoUrl),
  }));

  return NextResponse.json({
    count: insideWithoutPhotos.length,
    inside: insideWithoutPhotos,
  });
}
