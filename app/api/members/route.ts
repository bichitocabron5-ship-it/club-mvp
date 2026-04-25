import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const members = await prisma.member.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(members);
}

export async function POST(req: Request) {
  const body = await req.json();

  const member = await prisma.member.create({
    data: {
      fullName: body.fullName,
      dni: body.dni,
      phone: body.phone || null,
    },
  });

  return NextResponse.json(member);
}
