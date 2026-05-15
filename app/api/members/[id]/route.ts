// app/api/members/[id]/route.ts
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const memberUpdateSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  dni: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  rfidCode: z.string().trim().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);
  const body = await req.json();

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const parsed = memberUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const member = await prisma.member.update({
      where: { id: memberId },
      data: {
        fullName: data.fullName,
        dni: data.dni,
        phone: data.phone === "" ? null : data.phone,
        email: data.email === "" ? null : data.email,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : data.expiresAt === null ? null : undefined,
        rfidCode: data.rfidCode === "" ? null : data.rfidCode,
      },
    });

    return NextResponse.json(member);
  } catch {
    return NextResponse.json(
      { error: "No se pudo actualizar. Revisa DNI/RFID duplicados." },
      { status: 400 }
    );
  }
}
