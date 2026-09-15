import "server-only";

import {
  createSignedUrlForAllowedStorageRef,
  downloadAllowedStorageObject,
  serializeAllowedStorageRef,
} from "@/lib/contract-storage";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isStorageUrlsDisabled } from "@/lib/storage";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const SIGNED_CONTRACT_BUCKET = "signed-contracts";

const PDF_ERRORS = {
  CONTRACT_NOT_FOUND: { status: 404, message: "Contrato no encontrado" },
  SIGNED_PDF_IMMUTABLE: { status: 409, message: "El PDF firmado existente no puede sustituirse." },
  CONTRACT_TEMPLATE_UNRESOLVED: { status: 409, message: "No se puede determinar de forma segura la plantilla original del contrato." },
} as const;

export class ContractPdfError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof PDF_ERRORS) {
    super(PDF_ERRORS[code].message);
    this.status = PDF_ERRORS[code].status;
  }
}

function formatLongDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-ES");
}

function formatDayMonth(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function formatYearSuffix(value: string | Date | null | undefined) {
  if (!value) return "-";
  return String(new Date(value).getFullYear()).slice(-2);
}

function printableValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "number") {
    return String(value);
  }

  const trimmed = value.trim();
  return trimmed || "-";
}

export async function ensureSignedContractPdf(
  contractId: number,
  options?: { force?: boolean }
) {
  try {
    return await materializeSignedContractPdf(contractId, options);
  } catch (error) {
    if (error instanceof ContractPdfError) throw error;
    // The public signing caller logs this message: never propagate storage/DB/PII details.
    throw new Error("No se pudo obtener el PDF firmado");
  }
}

async function materializeSignedContractPdf(
  contractId: number,
  options?: { force?: boolean }
) {
  const contract = await prisma.memberContract.findUnique({
    where: { id: contractId },
    include: {
      member: true,
      contractTemplate: true,
    },
  });

  if (!contract) {
    throw new ContractPdfError("CONTRACT_NOT_FOUND");
  }

  if (isStorageUrlsDisabled()) {
    throw new Error("PDFs de contratos desactivados temporalmente.");
  }

  if (contract.signedPdfUrl !== null) {
    if (options?.force) throw new ContractPdfError("SIGNED_PDF_IMMUTABLE");
    const signedUrl = await createSignedUrlForAllowedStorageRef(
      contract.signedPdfUrl,
      {
        context: "lib/contract-pdf:existingSignedPdf",
      }
    );

    if (!signedUrl) {
      throw new Error("No se pudo generar URL temporal del contrato firmado");
    }

    return {
      url: signedUrl,
      contract,
      template: contract.contractTemplate,
    };
  }

  // Never fall back to today's active template or repair a historical association.
  const template = contract.contractTemplate;

  if (!contract.contractTemplateId || !template || template.id !== contract.contractTemplateId) {
    throw new ContractPdfError("CONTRACT_TEMPLATE_UNRESOLVED");
  }

  const { bytes: templateBytes } = await downloadAllowedStorageObject(
    template.fileUrl
  );
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();

  if (pages.length < 3) {
    throw new Error("La plantilla PDF requiere al menos 3 paginas");
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const textColor = rgb(0, 0, 0);

  const page1 = pages[0];
  const page2 = pages[1];
  const page3 = pages[2];

  // Pagina 1: fecha de firma y datos del socio.
  page1.drawText(formatLongDate(contract.signedAt), {
    x: 132,
    y: 793,
    size: 9,
    font,
    color: textColor,
  });
  page1.drawText(printableValue(contract.fullName), {
    x: 170,
    y: 688,
    size: 10,
    font,
    color: textColor,
  });
  page1.drawText(printableValue(contract.dni), {
    x: 165,
    y: 668,
    size: 10,
    font,
    color: textColor,
  });
  page1.drawText(printableValue(contract.address), {
    x: 188,
    y: 648,
    size: 9,
    font,
    color: textColor,
  });
  page1.drawText(printableValue(contract.birthPlace), {
    x: 181,
    y: 630,
    size: 9,
    font,
    color: textColor,
  });
  page1.drawText(formatLongDate(contract.birthDate), {
    x: 434,
    y: 630,
    size: 9,
    font,
    color: textColor,
  });
  page1.drawText(printableValue(contract.phone), {
    x: 238,
    y: 612,
    size: 9,
    font,
    color: textColor,
  });
  page1.drawText(printableValue(contract.email), {
    x: 217,
    y: 592,
    size: 9,
    font,
    color: textColor,
  });

  // Pagina 2: consumo declarado, fecha corta y firmas.
  page2.drawText(printableValue(contract.consumptionGrams), {
    x: 314,
    y: 486,
    size: 10,
    font: bold,
    color: textColor,
  });
  page2.drawText(formatDayMonth(contract.signedAt), {
    x: 183,
    y: 305,
    size: 9,
    font,
    color: textColor,
  });
  page2.drawText(formatYearSuffix(contract.signedAt), {
    x: 273,
    y: 305,
    size: 9,
    font,
    color: textColor,
  });

  // Pagina 3: nombre del socio, fecha y firmas finales.
  page3.drawText(printableValue(contract.fullName), {
    x: 300,
    y: 315,
    size: 9,
    font,
    color: textColor,
  });
  page3.drawText(formatDayMonth(contract.signedAt), {
    x: 188,
    y: 250,
    size: 9,
    font,
    color: textColor,
  });
  page3.drawText(formatYearSuffix(contract.signedAt), {
    x: 293,
    y: 250,
    size: 9,
    font,
    color: textColor,
  });

  if (contract.signatureImage) {
    const base64 = contract.signatureImage.split(",")[1];
    const signatureBytes = Buffer.from(base64, "base64");
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    // Pagina 2: firma principal.
    page2.drawImage(signatureImage, {
      x: 428,
      y: 370,
      width: 118,
      height: 44,
    });

    // Pagina 2: firma secundaria.
    page2.drawImage(signatureImage, {
      x: 418,
      y: 154,
      width: 118,
      height: 44,
    });

    // Pagina 3: firma superior.
    page3.drawImage(signatureImage, {
      x: 443,
      y: 430,
      width: 108,
      height: 40,
    });

    // Pagina 3: firma inferior.
    page3.drawImage(signatureImage, {
      x: 448,
      y: 258,
      width: 108,
      height: 40,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfMemberIdentifier = (
    contract.member.memberNumber || String(contract.member.id)
  ).replace(/[^a-zA-Z0-9_-]/g, "-");
  const filePath = `contracts/member-${pdfMemberIdentifier}/contract-${contract.id}.pdf`;
  const supabaseAdmin = getSupabaseAdmin();

  const upload = await supabaseAdmin.storage
    .from(SIGNED_CONTRACT_BUCKET)
    .upload(filePath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: false,
    });

  if (upload.error) {
    // Another initial generation may have published. Only reuse a DB-confirmed
    // publication; never adopt an unreferenced object of unknown provenance.
    return reuseConcurrentPublication(contract.id, options);
  }

  const storedPdfRef = serializeAllowedStorageRef({
    bucket: SIGNED_CONTRACT_BUCKET,
    path: filePath,
  });
  try {
    // Atomic compare-and-set, without holding a transaction during PDF/storage IO.
    // The uploaded object is never overwritten, even if the member's path changed.
    await prisma.memberContract.update({
      where: { id: contract.id, signedPdfUrl: null },
      data: { signedPdfUrl: storedPdfRef },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return reuseConcurrentPublication(contract.id, options);
    }
    throw error;
  }

  // Publish before requesting a temporary URL: URL failure must not orphan a
  // successfully published PDF or require regeneration on retry.
  const signedUrl = await createSignedUrlForAllowedStorageRef(storedPdfRef, {
    context: "lib/contract-pdf:newSignedPdf",
  });
  if (!signedUrl) throw new Error("No se pudo obtener el PDF firmado");

  return {
    url: signedUrl,
    contract: { ...contract, signedPdfUrl: storedPdfRef },
    template,
  };
}

async function reuseConcurrentPublication(contractId: number, options?: { force?: boolean }) {
  const published = await prisma.memberContract.findUnique({
    where: { id: contractId },
    include: { contractTemplate: true },
  });
  if (!published) throw new ContractPdfError("CONTRACT_NOT_FOUND");
  if (published.signedPdfUrl === null) throw new Error("No se pudo obtener el PDF firmado");
  if (options?.force) throw new ContractPdfError("SIGNED_PDF_IMMUTABLE");
  const url = await createSignedUrlForAllowedStorageRef(published.signedPdfUrl, {
    context: "lib/contract-pdf:concurrentPublication",
  });
  if (!url) throw new Error("No se pudo obtener el PDF firmado");
  return { url, contract: published, template: published.contractTemplate };
}
