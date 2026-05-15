// app/api/contract-templates/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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

  const template = await prisma.contractTemplate.create({
    data: {
      name: body.name,
      version: body.version,
      fileUrl: body.fileUrl,
      active: body.active ?? true,
    },
  });

  return NextResponse.json(template);
}
