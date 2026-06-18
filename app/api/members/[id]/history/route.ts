// app/api/members/[id]/history/route.ts
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { resolveStorageUrlForResponse } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json(
      { error: "ID de socio inválido" },
      { status: 400 }
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    return NextResponse.json(
      { error: "Socio no encontrado" },
      { status: 404 }
    );
  }

  const sales = await prisma.sale.findMany({
    where: { memberId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const activeSales = sales.filter((sale) => !sale.cancelledAt);
  const totalSpent = activeSales.reduce(
    (acc: number, sale) =>
      acc + Number(sale.finalAmount ?? sale.totalAmount ?? 0),
    0
  );

  return NextResponse.json({
    member: {
      ...member,
      photoUrl: await resolveStorageUrlForResponse(member.photoUrl, {
        context: "api/members/[id]/history:photoUrl",
      }),
      dniFrontUrl: await resolveStorageUrlForResponse(member.dniFrontUrl, {
        context: "api/members/[id]/history:dniFrontUrl",
      }),
      dniBackUrl: await resolveStorageUrlForResponse(member.dniBackUrl, {
        context: "api/members/[id]/history:dniBackUrl",
      }),
    },
    sales,
    totalSpent,
    count: activeSales.length,
  });
}
