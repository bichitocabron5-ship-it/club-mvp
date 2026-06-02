import type { Prisma } from "@prisma/client";

import { getClubSettings } from "@/lib/club-settings";
import { createSignedUrlForAllowedStorageRef } from "@/lib/contract-storage";
import {
  findActiveContractTemplate,
  resolveContractTemplateForContract,
} from "@/lib/contract-templates";
import type { PublicSigningSessionData } from "@/lib/types";

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

  return {
    status: session.status,
    member: {
      fullName: session.member.fullName,
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
