// app/api/members/[id]/history/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { resolveStorageUrlForResponse } from "@/lib/storage";
import { memberDniUrls } from "@/lib/member-dni";
import { NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  const { id } = await params;
  const memberId = Number(id);

  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(memberId) || memberId > 2_147_483_647) {
    return NextResponse.json(
      { error: "ID de socio inválido" },
      { status: 400, headers }
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true, memberNumber: true, fullName: true, dni: true, phone: true,
      email: true, active: true, joinedAt: true, expiresAt: true, rfidCode: true,
      // Photo is displayed; DNI refs are only inputs to the protected availability reader.
      photoUrl: true, dniFrontUrl: true, dniBackUrl: true,
      commercialProfile: auth.session.user.role === "ADMIN",
      discountPercent: auth.session.user.role === "ADMIN",
      commercialNotes: auth.session.user.role === "ADMIN",
    },
  });

  if (!member) {
    return NextResponse.json(
      { error: "Socio no encontrado" },
      { status: 404, headers }
    );
  }

  const sales = await prisma.sale.findMany({
    where: { memberId },
    select: {
      id: true, qty: true, totalAmount: true, finalAmount: true,
      originalAmount: true, discountAmount: true, discountReason: true,
      cancelledAt: true, cancelReason: true, createdAt: true,
      product: { select: { name: true, unit: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Keep cancelled rows visible, but exclude them from both aggregates.
  const activeSales = sales.filter((sale) => !sale.cancelledAt);
  const totalSpent = activeSales.reduce(
    (acc: number, sale) =>
      acc + Number(sale.finalAmount ?? sale.totalAmount ?? 0),
    0
  );

  const dniAvailability = await memberDniUrls(member);
  return NextResponse.json({
    member: {
      id: member.id,
      memberNumber: member.memberNumber,
      fullName: member.fullName,
      dni: member.dni,
      phone: member.phone,
      email: member.email,
      active: member.active,
      joinedAt: member.joinedAt,
      expiresAt: member.expiresAt,
      rfidCode: member.rfidCode,
      photoUrl: await resolveStorageUrlForResponse(member.photoUrl, {
        context: "api/members/[id]/history:photoUrl",
      }),
      hasDniFront: Boolean(dniAvailability.dniFrontUrl),
      hasDniBack: Boolean(dniAvailability.dniBackUrl),
      ...(auth.session.user.role === "ADMIN" ? {
        commercialProfile: member.commercialProfile,
        discountPercent: member.discountPercent,
        commercialNotes: member.commercialNotes,
      } : {}),
    },
    sales: sales.map(sale => ({
      id: sale.id,
      qty: sale.qty,
      totalAmount: sale.totalAmount,
      finalAmount: sale.finalAmount,
      originalAmount: sale.originalAmount,
      discountAmount: sale.discountAmount,
      discountReason: sale.discountReason,
      cancelledAt: sale.cancelledAt,
      cancelReason: sale.cancelReason,
      createdAt: sale.createdAt,
      product: { name: sale.product.name, unit: sale.product.unit },
    })),
    totalSpent,
    count: activeSales.length,
  }, { headers });
}
