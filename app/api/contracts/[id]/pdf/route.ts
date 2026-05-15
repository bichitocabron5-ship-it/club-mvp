// app/api/contracts/[id]/pdf/route.ts
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-ES");
}

function formatDayMonth(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function formatYearSuffix(value: string | Date | null | undefined) {
  if (!value) return "";
  return String(new Date(value).getFullYear()).slice(-2);
}

async function fetchPdfBytes(url: string) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("No se pudo cargar la plantilla PDF");
  }

  return Buffer.from(await res.arrayBuffer());
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
    return NextResponse.json(
      { error: "Contrato no encontrado" },
      { status: 404 }
    );
  }

  const template = await prisma.contractTemplate.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });

  if (!template) {
    return NextResponse.json(
      { error: "No hay plantilla de contrato activa" },
      { status: 400 }
    );
  }

  const templateBytes = await fetchPdfBytes(template.fileUrl);
  const pdfDoc = await PDFDocument.load(templateBytes);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  const page1 = pages[0];
  const page2 = pages[1];
  const page3 = pages[2];

  const textColor = rgb(0, 0, 0);

  // Página 1 - datos principales
  page1.drawText(formatDate(contract.signedAt), {
    x: 120,
    y: 795,
    size: 9,
    font,
    color: textColor,
  });

  page1.drawText(contract.fullName || "", {
    x: 155,
    y: 688,
    size: 10,
    font,
    color: textColor,
  });

  page1.drawText(contract.dni || "", {
    x: 160,
    y: 668,
    size: 10,
    font,
    color: textColor,
  });

  page1.drawText(contract.address || "", {
    x: 175,
    y: 648,
    size: 9,
    font,
    color: textColor,
  });

  page1.drawText(contract.birthPlace || "", {
    x: 165,
    y: 630,
    size: 9,
    font,
    color: textColor,
  });

  page1.drawText(formatDate(contract.birthDate), {
    x: 430,
    y: 630,
    size: 9,
    font,
    color: textColor,
  });

  page1.drawText(contract.phone || "", {
    x: 225,
    y: 613,
    size: 9,
    font,
    color: textColor,
  });

  page1.drawText(contract.email || "", {
    x: 205,
    y: 592,
    size: 9,
    font,
    color: textColor,
  });

  // page1.drawText(String(contract.memberId), {
    // x: 225,
    // y: 520,
    // size: 9,
    // font,
    // color: textColor,
  // });

  // Página 2 - consumo mensual y firma principal
  page2.drawText(
    contract.consumptionGrams ? String(contract.consumptionGrams) : "",
    {
      x: 300,
      y: 486,
      size: 10,
      font: bold,
      color: textColor,
    }
  );

  page2.drawText(formatDayMonth(contract.signedAt), {
    x: 175,
    y: 305,
    size: 9,
    font,
    color: textColor,
  });

  page2.drawText(formatYearSuffix(contract.signedAt), {
    x: 265,
    y: 305,
    size: 9,
    font,
    color: textColor,
  });

  // page2.drawText(String(contract.memberId), {
    // x: 195,
    // y: 178,
    // size: 9,
    // font,
    // color: textColor,
  // });

  // Página 3 - protección de datos y aval
  page3.drawText(formatDayMonth(contract.signedAt), {
    x: 180,
    y: 250,
    size: 9,
    font,
    color: textColor,
  });

  page3.drawText(formatYearSuffix(contract.signedAt), {
    x: 285,
    y: 250,
    size: 9,
    font,
    color: textColor,
  });

  page3.drawText(contract.fullName || "", {
    x: 290,
    y: 315,
    size: 9,
    font,
    color: textColor,
  });

  if (contract.signatureImage) {
    const base64 = contract.signatureImage.split(",")[1];
    const signatureBytes = Buffer.from(base64, "base64");
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    page2.drawImage(signatureImage, {
      x: 430,
      y: 370,
      width: 115,
      height: 42,
    });

    page2.drawImage(signatureImage, {
      x: 420,
      y: 155,
      width: 115,
      height: 42,
    });

    page3.drawImage(signatureImage, {
      x: 445,
      y: 430,
      width: 105,
      height: 38,
    });

    page3.drawImage(signatureImage, {
      x: 450,
      y: 260,
      width: 105,
      height: 38,
    });
  }

  const pdfBytes = await pdfDoc.save();

  const filePath = `contracts/member-${contract.memberId}/contract-${contract.id}.pdf`;

  const upload = await supabaseAdmin.storage
    .from("signed-contracts")
    .upload(filePath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
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