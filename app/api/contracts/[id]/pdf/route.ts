// app/api/contracts/[id]/pdf/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase-admin";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-ES");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contractId = Number(id);

  if (!contractId || Number.isNaN(contractId)) {
    return NextResponse.json({ error: "Contrato inválido" }, { status: 400 });
  }

  const contract = await prisma.memberContract.findUnique({
    where: { id: contractId },
    include: { member: true },
  });

  if (!contract) {
    return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  }

  const pdfDoc = await PDFDocument.create();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { height } = page.getSize();

  let y = height - 60;

  page.drawText("SOLICITUD DE ALTA DE SOCIO", {
    x: 60,
    y,
    size: 18,
    font: bold,
    color: rgb(0.05, 0.05, 0.05),
  });

  y -= 30;

  page.drawText("Contrato provisional generado digitalmente", {
    x: 60,
    y,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  y -= 40;

  page.drawText("Datos del socio", {
    x: 60,
    y,
    size: 14,
    font: bold,
  });

  y -= 24;

  const rows = [
    ["Nombre completo", contract.fullName],
    ["DNI", contract.dni],
    ["Domicilio", contract.address || ""],
    ["Lugar de nacimiento", contract.birthPlace || ""],
    ["Fecha de nacimiento", formatDate(contract.birthDate)],
    ["Telefono", contract.phone || ""],
    ["Email", contract.email || ""],
    ["Consumo mensual declarado", contract.consumptionGrams ? `${contract.consumptionGrams} g` : ""],
    ["Fecha de firma", formatDate(contract.signedAt)],
  ];

  for (const [label, value] of rows) {
    page.drawText(`${label}:`, {
      x: 60,
      y,
      size: 10,
      font: bold,
    });

    page.drawText(String(value || "-"), {
      x: 220,
      y,
      size: 10,
      font,
    });

    y -= 20;
  }

  y -= 20;

  page.drawText("Declaracion", {
    x: 60,
    y,
    size: 14,
    font: bold,
  });

  y -= 24;

  const declarationLines = [
    "El socio declara haber leido y aceptado las condiciones internas del club.",
    "Declara que los datos facilitados son correctos y que firma el presente documento",
    "de forma libre y voluntaria.",
    "Este documento ha sido generado digitalmente y queda asociado al historial del socio.",
  ];

  for (const line of declarationLines) {
    page.drawText(line, {
      x: 60,
      y,
      size: 10,
      font,
    });
    y -= 16;
  }

  y -= 35;

  page.drawText("Firma del socio", {
    x: 60,
    y,
    size: 12,
    font: bold,
  });

  y -= 110;

  if (contract.signatureImage) {
    const base64 = contract.signatureImage.split(",")[1];
    const signatureBytes = Buffer.from(base64, "base64");
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    page.drawImage(signatureImage, {
      x: 60,
      y,
      width: 220,
      height: 80,
    });
  }

  y -= 20;

  page.drawLine({
    start: { x: 60, y },
    end: { x: 300, y },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  y -= 18;

  page.drawText(`${contract.fullName} - ${contract.dni}`, {
    x: 60,
    y,
    size: 9,
    font,
  });

  const pdfBytes = await pdfDoc.save();

  const filePath = `contracts/member-${contract.memberId}/contract-${contract.id}.pdf`;

  const upload = await supabaseAdmin.storage
    .from("signed-contracts")
    .upload(filePath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upload.error) {
    return NextResponse.json(
      { error: upload.error.message },
      { status: 500 }
    );
  }

  const { data } = supabaseAdmin.storage
    .from("signed-contracts")
    .getPublicUrl(filePath);

  await prisma.memberContract.update({
    where: { id: contract.id },
    data: {
      signedPdfUrl: data.publicUrl,
    },
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="contrato-${contract.id}.pdf"`,
    },
  });
}