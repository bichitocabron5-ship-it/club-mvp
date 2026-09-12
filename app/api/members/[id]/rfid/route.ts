import { requireStaffOrAdmin } from "@/lib/auth-server";
import { NextResponse } from "next/server";
import { PATCH as patchMember } from "../route";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body: unknown = await req.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !("rfidCode" in body) || !("expectedRfidCode" in body) ||
      Object.keys(body).some((key) => key !== "rfidCode" && key !== "expectedRfidCode")) {
    return NextResponse.json({ code: "INVALID_PAYLOAD", error: "Solo se admite rfidCode y expectedRfidCode" }, { status: 400 });
  }
  return patchMember(req, context);
}
