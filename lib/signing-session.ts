import { verifyContractDocumentSnapshot } from "@/lib/contract-document-snapshot";
import type { Prisma } from "@prisma/client";

import { getPersistedMonthlyLimitG } from "@/lib/club-settings";
import {
  createSignedUrlForAllowedStorageRef,
  SigningTemplateError,
} from "@/lib/contract-storage";
import { prisma } from "@/lib/prisma";
import type {
  InternalSigningSessionData,
  PublicSigningSessionData,
} from "@/lib/types";

export const SIGNING_SESSION_TTL_HOURS = 24;

export type SigningSessionWithPublicRelations = Prisma.SigningSessionGetPayload<{
  include: {
    member: true;
    contract: true;
    contractTemplate: true;
  };
}>;

export function getSigningSessionExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SIGNING_SESSION_TTL_HOURS);
  return expiresAt;
}

export function isSigningSessionExpired(expiresAt: Date | string) {
  return new Date(expiresAt) <= new Date();
}

export function requireSessionContractTemplate(session: SigningSessionWithPublicRelations) {
  if (!session.contractTemplateId || !session.contractTemplate ||
      session.contractTemplate.id !== session.contractTemplateId) {
    throw new SigningTemplateError("SIGNING_TEMPLATE_UNRESOLVED");
  }
  if (session.documentSnapshotId &&
      session.contractTemplate.documentSnapshotId !== session.documentSnapshotId) {
    throw new SigningTemplateError("SIGNING_DOCUMENT_CHANGED");
  }
  return session.contractTemplate;
}

/** Read immutable bytes outside the signing transaction; never infer from fileUrl. */
export async function requireSessionDocumentSnapshot(session: { documentSnapshotId: string | null }) {
  if (!session.documentSnapshotId) throw new SigningTemplateError("SIGNING_DOCUMENT_REQUIRED");
  try {
    const snapshot = await prisma.contractDocumentSnapshot.findUnique({ where: { id: session.documentSnapshotId } });
    if (!snapshot || snapshot.id !== session.documentSnapshotId) throw new Error("Missing snapshot");
    return await verifyContractDocumentSnapshot(snapshot);
  } catch {
    throw new SigningTemplateError("SIGNING_DOCUMENT_UNAVAILABLE");
  }
}

async function getLatestContractData(session: SigningSessionWithPublicRelations) {
  if (session.contract) {
    return session.contract;
  }

  return prisma.memberContract.findFirst({
    where: { memberId: session.memberId },
    orderBy: [{ signedAt: "desc" }, { id: "desc" }],
  });
}

export async function serializePublicSigningSession(
  session: SigningSessionWithPublicRelations | null
): Promise<PublicSigningSessionData | null> {
  if (!session) {
    return null;
  }

  // A signed contract wins, including legacy null provenance. Never use today's active template.
  let contractTemplate: SigningSessionWithPublicRelations["contractTemplate"] = null;
  if (session.contract) {
    if (session.contract.contractTemplateId) {
      contractTemplate = await prisma.contractTemplate.findUnique({
        where: { id: session.contract.contractTemplateId },
      });
    }
  } else if (session.status === "PENDING") {
    contractTemplate = requireSessionContractTemplate(session);
  }
  let contractTemplateFileUrl: string | null = null;
  if (contractTemplate) {
    if (!session.contract && session.status === "PENDING") {
      const snapshot = await requireSessionDocumentSnapshot(session);
      contractTemplateFileUrl = `/api/signing-sessions/${encodeURIComponent(session.token)}?mode=document&expectedDocumentSnapshotId=${encodeURIComponent(snapshot.id)}`;
    } else if (session.contract?.documentSnapshotId === null) {
      // Historical recognition must not depend on Storage availability.
      try {
        contractTemplateFileUrl = await createSignedUrlForAllowedStorageRef(contractTemplate.fileUrl, {
          context: "lib/signing-session:contractTemplate",
        });
      } catch { /* Keep the signed result without a template link. */ }
    }
  }
  // Signed responses (including replay) never depend on current settings.
  let authorizedMonthlyLimitG: number | null = null;
  let monthlyLimitError: PublicSigningSessionData["monthlyLimitError"] = null;
  if (!session.contract && session.status === "PENDING") {
    try {
      authorizedMonthlyLimitG = await getPersistedMonthlyLimitG();
      if (authorizedMonthlyLimitG === null) {
        monthlyLimitError = "MONTHLY_LIMIT_NOT_CONFIGURED";
      }
    } catch {
      monthlyLimitError = "MONTHLY_LIMIT_UNAVAILABLE";
    }
  }
  const contractData = await getLatestContractData(session);

  return {
    documentSnapshotId: session.contract ? session.contract.documentSnapshotId : session.documentSnapshotId,
    status: session.contract ? "SIGNED" : session.status,
    member: {
      fullName: session.member.fullName,
      dni: session.member.dni,
      phone: session.member.phone,
      email: session.member.email,
      address: contractData?.address ?? null,
      birthPlace: contractData?.birthPlace ?? null,
      birthDate: contractData?.birthDate?.toISOString() ?? null,
      consumptionGrams: session.contract
        ? session.contract.consumptionGrams
        : authorizedMonthlyLimitG,
      memberNumber: session.member.memberNumber,
      displayNumber: session.member.memberNumber ?? String(session.member.id),
    },
    contractTemplate: contractTemplate && contractTemplateFileUrl
      ? {
          id: contractTemplate.id,
          name: contractTemplate.name,
          version: contractTemplate.version,
          fileUrl: contractTemplateFileUrl,
        }
      : null,
    clubSettings: {
      defaultMonthlyLimitG: authorizedMonthlyLimitG,
    },
    monthlyLimitError,
  };
}

export async function serializeInternalSigningSession(
  session: SigningSessionWithPublicRelations | null,
  req: Request
): Promise<InternalSigningSessionData | null> {
  const payload = await serializePublicSigningSession(session);

  if (!session || !payload) {
    return null;
  }

  return {
    ...payload,
    token: session.token,
    signUrl: new URL(
      `/sign/${encodeURIComponent(session.token)}`,
      req.url
    ).toString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}
