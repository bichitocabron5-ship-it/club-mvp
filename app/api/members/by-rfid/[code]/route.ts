// app/api/members/by-rfid/[code]/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const cleanCode = code.trim();

  if (!cleanCode) {
    return NextResponse.json(
      { error: "Código RFID inválido" },
      { status: 400 }
    );
  }

  const member = await prisma.member.findUnique({
    where: {
      rfidCode: cleanCode,
    },
  });

  if (!member) {
    return NextResponse.json(
      { error: "Chapita no asignada" },
      { status: 404 }
    );
  }

  return NextResponse.json(member);
}