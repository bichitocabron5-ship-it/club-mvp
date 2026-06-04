import type { Prisma } from "@prisma/client";

import { getClubSettings } from "@/lib/club-settings";
import { createSignedUrlForAllowedStorageRef } from "@/lib/contract-storage";
import {
  findActiveContractTemplate,
  resolveContractTemplateForContract,
} from "@/lib/contract-templates";
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

  const contractTemplate = session.contract?.contractTemplateId
    ? await resolveContractTemplateForContract(session.contract.contractTemplateId)
    : await findActiveContractTemplate();
  const contractTemplateFileUrl = contractTemplate
    ? await createSignedUrlForAllowedStorageRef(contractTemplate.fileUrl)
    : null;
  const settings = await getClubSettings();
  const contractData = await getLatestContractData(session);

  return {
    status: session.status,
    member: {
      fullName: session.member.fullName,
      dni: session.member.dni,
      phone: session.member.phone,
      email: session.member.email,
      address: contractData?.address ?? null,
      birthPlace: contractData?.birthPlace ?? null,
      birthDate: contractData?.birthDate?.toISOString() ?? null,
      consumptionGrams: contractData?.consumptionGrams ?? null,
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
      defaultMonthlyLimitG: settings.defaultMonthlyLimitG,
    },
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
