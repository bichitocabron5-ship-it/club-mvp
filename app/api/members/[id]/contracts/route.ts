// app/api/members/[id]/contracts/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { createSignedUrlForAllowedStorageRef } from "@/lib/contract-storage";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);

  const contracts = await prisma.memberContract.findMany({
    where: { memberId },
    select: {
      id: true,
      memberId: true,
      signingSessionId: true,
      contractTemplateId: true,
      fullName: true,
      dni: true,
      address: true,
      birthPlace: true,
      birthDate: true,
      phone: true,
      email: true,
      consumptionGrams: true,
      signedAt: true,
      signedPdfUrl: true,
      contractTemplate: true,
    },
    orderBy: { signedAt: "desc" },
  });

  const response = await Promise.all(
    contracts.map(async (contract) => ({
      id: contract.id,
      memberId: contract.memberId,
      signingSessionId: contract.signingSessionId,
      contractTemplateId: contract.contractTemplateId,
      fullName: contract.fullName,
      dni: contract.dni,
      address: contract.address,
      birthPlace: contract.birthPlace,
      birthDate: contract.birthDate,
      phone: contract.phone,
      email: contract.email,
      consumptionGrams: contract.consumptionGrams,
      signedAt: contract.signedAt,
      signedPdfUrl:
        (await createSignedUrlForAllowedStorageRef(contract.signedPdfUrl, {
          context: "api/members/[id]/contracts:signedPdfUrl",
        })) ??
        null,
      contractTemplate: contract.contractTemplate
        ? {
            ...contract.contractTemplate,
            fileUrl: null,
          }
        : null,
    }))
  );

  return NextResponse.json(response);
}
