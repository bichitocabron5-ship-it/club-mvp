import { requireStaffOrAdmin } from "@/lib/auth-server";
import { ContractPdfError, ensureSignedContractPdf } from "@/lib/contract-pdf";
import { isStorageUrlsDisabled } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(contractId) || contractId > 2_147_483_647) {
      return NextResponse.json({ error: "Contrato inválido" }, { status: 400 });
    }

    if (isStorageUrlsDisabled()) {
      return NextResponse.json(
        { error: "PDFs de contratos desactivados temporalmente." },
        { status: 503 }
      );
    }

    const pdf = await ensureSignedContractPdf(contractId, { force });
    return NextResponse.redirect(pdf.url);
  } catch (error) {
    if (error instanceof ContractPdfError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: "No se pudo obtener el PDF firmado",
      },
      { status: 500 }
    );
  }
}
