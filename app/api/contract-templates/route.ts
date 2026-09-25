// app/api/contract-templates/route.ts
import { requireAdmin } from "@/lib/auth-server";
import {
  createSignedUrlForAllowedStorageRef,
  parseAllowedStorageRef,
} from "@/lib/contract-storage";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createContractTemplate, ContractTemplateCreationError } from "@/lib/contract-templates";
import { ContractDocumentSnapshotError } from "@/lib/contract-document-snapshot";

const contractTemplateSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  fileUrl: z.string().trim().min(1),
  active: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const templates = await prisma.contractTemplate.findMany({
    orderBy: { createdAt: "desc" },
  });

  const response = await Promise.all(
    templates.map(async (template) => ({
      ...template,
      fileUrl: await createSignedUrlForAllowedStorageRef(template.fileUrl, {
        context: "api/contract-templates:get",
      }),
    }))
  );

  return NextResponse.json(response);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = contractTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const storageRef = parseAllowedStorageRef(parsed.data.fileUrl);

  if (!storageRef) {
    return NextResponse.json(
      { error: "La plantilla debe estar en Supabase Storage del proyecto" },
      { status: 400 }
    );
  }

  try {
    const template = await createContractTemplate({
      name: parsed.data.name,
      version: parsed.data.version,
      fileUrl: storageRef.storageRef,
      active: parsed.data.active ?? true,
    });

    return NextResponse.json({
      ...template,
      fileUrl: await createSignedUrlForAllowedStorageRef(template.fileUrl, {
        context: "api/contract-templates:post",
      }),
    });
  } catch (error) {
    if (error instanceof ContractTemplateCreationError || error instanceof ContractDocumentSnapshotError) {
      return NextResponse.json({ code: error.code, error: "No se pudo capturar el documento de la plantilla" },
        { status: error instanceof ContractTemplateCreationError && error.code === "TEMPLATE_STORAGE_UNAVAILABLE" ? 503 : 422 });
    }
    throw error;
  }
}
