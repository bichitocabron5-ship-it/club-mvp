// app/api/access/current/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { getCurrentInsideMembers } from "@/lib/access";
import { resolveStorageUrlForResponse } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const inside = await getCurrentInsideMembers();
  const insideWithPhotos = await Promise.all(
    inside.map(async (member) => ({
      ...member,
      photoUrl: await resolveStorageUrlForResponse(member.photoUrl),
    }))
  );

  return NextResponse.json({
    count: insideWithPhotos.length,
    inside: insideWithPhotos,
  });
}
