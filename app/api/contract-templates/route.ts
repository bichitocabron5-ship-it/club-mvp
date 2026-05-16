// app/api/contract-templates/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { parseAllowedStorageRef } from "@/lib/contract-storage";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const contractTemplateSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  fileUrl: z.string().trim().min(1),
  active: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const templates = await prisma.contractTemplate.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = contractTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const storageRef = parseAllowedStorageRef(parsed.data.fileUrl);

  if (!storageRef) {
    return NextResponse.json(
      { error: "La plantilla debe estar en Supabase Storage del proyecto" },
      { status: 400 }
    );
  }

  const template = await prisma.contractTemplate.create({
    data: {
      name: parsed.data.name,
      version: parsed.data.version,
      fileUrl: storageRef.publicUrl,
      active: parsed.data.active ?? true,
    },
  });

  return NextResponse.json(template);
}
