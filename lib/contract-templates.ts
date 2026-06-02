import "server-only";

import { buildStoredStorageRef } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const CONTRACT_TEMPLATE_BUCKET = "contract-templates";

function buildTemplateName(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
}

function buildTemplateVersion(updatedAt: string | null | undefined) {
  if (!updatedAt) {
    return "storage-import";
  }

  const date = new Date(updatedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

async function bootstrapContractTemplateFromStorage() {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: files, error } = await supabaseAdmin.storage
    .from(CONTRACT_TEMPLATE_BUCKET)
    .list("", {
      limit: 100,
      sortBy: { column: "updated_at", order: "desc" },
    });

  if (error) {
    throw new Error("No se pudo consultar la carpeta de plantillas de contrato");
  }

  const pdfFiles = (files ?? []).filter(
    (file) =>
      file.name &&
      !file.id?.endsWith("/") &&
      file.name.toLowerCase().endsWith(".pdf")
  );

  if (pdfFiles.length === 0) {
    return null;
  }

  const latestFile = [...pdfFiles].sort((a, b) => {
    const left = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    const right = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    return left - right;
  })[0];

  await prisma.contractTemplate.updateMany({
    where: { active: true },
    data: { active: false },
  });

  return prisma.contractTemplate.create({
    data: {
      name: buildTemplateName(latestFile.name),
      version: buildTemplateVersion(latestFile.updated_at ?? latestFile.created_at),
      fileUrl: buildStoredStorageRef(CONTRACT_TEMPLATE_BUCKET, latestFile.name),
      active: true,
    },
  });
}

export async function findActiveContractTemplate() {
  const existingTemplate = await prisma.contractTemplate.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });

  if (existingTemplate) {
    return existingTemplate;
  }

  return bootstrapContractTemplateFromStorage();
}

export async function resolveContractTemplateForContract(
  contractTemplateId: number | null | undefined
) {
  if (contractTemplateId) {
    const template = await prisma.contractTemplate.findUnique({
      where: { id: contractTemplateId },
    });

    if (template) {
      return template;
    }
  }

  return findActiveContractTemplate();
}
