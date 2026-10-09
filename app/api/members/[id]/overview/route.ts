import { requireStaffOrAdmin } from "@/lib/auth-server";
import type { MemberOverviewDTO } from "@/lib/dtos/member-overview";
import { resolveMemberDni } from "@/lib/member-dni";
import { composeMemberOperationalStatus, getMemberOperationalFacts } from "@/lib/member-operational-status";
import { prisma } from "@/lib/prisma";
import { getMonthRange, getMonthlyGramTotal } from "@/lib/sales-rules";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaffOrAdmin();
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers });

    const { id } = await params;
    const memberId = Number(id);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(memberId) || memberId > 2_147_483_647) {
      return Response.json({ error: "ID de socio inválido" }, { status: 400, headers });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true, memberNumber: true, fullName: true, joinedAt: true,
        active: true, expiresAt: true, rfidCode: true,
        dniFrontUrl: true, dniBackUrl: true,
      },
    });
    if (!member) return Response.json({ error: "Socio no encontrado" }, { status: 404, headers });

    const now = new Date();
    const { start, end } = getMonthRange(now);
    // Independent reads; this informational response is not a transaction snapshot.
    const [contract, sales, front, back, lastEvent] = await Promise.all([
      prisma.memberContract.findFirst({
        where: { memberId },
        orderBy: [{ signedAt: "desc" }, { id: "desc" }],
        select: { id: true, signedAt: true, consumptionGrams: true },
      }),
      prisma.sale.findMany({
        where: { memberId, cancelledAt: null, createdAt: { gte: start, lt: end } },
        select: { qty: true, product: { select: { unit: true } } },
      }),
      resolveMemberDni(memberId, "front", member.dniFrontUrl),
      resolveMemberDni(memberId, "back", member.dniBackUrl),
      prisma.accessLog.findFirst({
        where: { memberId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { type: true, createdAt: true },
      }),
    ]);

    const facts = getMemberOperationalFacts(member, contract, now);
    const monthlyGrams = getMonthlyGramTotal(sales);
    // JSON would silently turn a non-finite total into null, violating the DTO.
    if (!Number.isFinite(monthlyGrams)) {
      return Response.json({ error: "Error interno" }, { status: 500, headers });
    }
    const response: MemberOverviewDTO = {
      identity: {
        id: member.id,
        memberNumber: member.memberNumber,
        fullName: member.fullName,
        joinedAt: member.joinedAt.toISOString(),
      },
      operational: {
        active: facts.active,
        expiresAt: facts.expiresAt?.toISOString() ?? null,
        ...composeMemberOperationalStatus(facts),
        hasRfid: facts.hasRfid,
      },
      contract: contract ? { id: contract.id, signedAt: contract.signedAt.toISOString() } : null,
      consumption: {
        monthlyGrams,
        monthlyLimitG: facts.monthlyLimitG,
        periodStart: start.toISOString(),
        periodEndExclusive: end.toISOString(),
      },
      documentation: { hasDniFront: Boolean(front), hasDniBack: Boolean(back) },
      access: {
        lastEvent: lastEvent ? { type: lastEvent.type, createdAt: lastEvent.createdAt.toISOString() } : null,
      },
    };
    return Response.json(response, { headers });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500, headers });
  }
}
