import { requireStaffOrAdmin } from "@/lib/auth-server";
import { ensureSignedContractPdf } from "@/lib/contract-pdf";
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
  const contractId = Number(id);
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  if (force && auth.session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (!contractId || Number.isNaN(contractId)) {
    return NextResponse.json({ error: "Contrato inv�lido" }, { status: 400 });
  }

  try {
    const pdf = await ensureSignedContractPdf(contractId, { force });
    return NextResponse.redirect(pdf.url);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo generar el PDF",
      },
      { status: 500 }
    );
  }
}
