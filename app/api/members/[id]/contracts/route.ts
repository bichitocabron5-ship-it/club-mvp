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
    include: {
      contractTemplate: true,
    },
    orderBy: { signedAt: "desc" },
  });

  const response = await Promise.all(
    contracts.map(async (contract) => ({
      ...contract,
      signedPdfUrl:
        (await createSignedUrlForAllowedStorageRef(contract.signedPdfUrl)) ??
        null,
      contractTemplate: contract.contractTemplate
        ? {
            ...contract.contractTemplate,
            fileUrl: await createSignedUrlForAllowedStorageRef(
              contract.contractTemplate.fileUrl
            ),
          }
        : null,
    }))
  );

  return NextResponse.json(response);
}
