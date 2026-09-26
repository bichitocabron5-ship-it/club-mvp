import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SigningTemplateError } from "@/lib/contract-storage";
import { SIGNING_SESSION_TTL_HOURS } from "@/lib/signing-session";

type Actor = { id: number; email: string | null };

export class SigningLifecycleError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

// All lifecycle writers acquire Member before SigningSession. Do not perform
// Storage/network work while holding these locks.
export async function lockSigningMember(tx: Prisma.TransactionClient, memberId: number) {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "Member" WHERE "id" = ${memberId} FOR UPDATE
  `;
  if (!rows.length) throw new SigningLifecycleError(404, "SIGNING_MEMBER_NOT_FOUND");
}

async function audit(
  tx: Prisma.TransactionClient, actor: Actor, action: string,
  memberId: number, signingSessionId: number, reason: "ADMIN_CANCEL" | "NEW_LINK" | "REISSUE",
  replacementSigningSessionId?: number,
) {
  // Mandatory audit: deliberately do not use the best-effort audit helper.
  try {
    await tx.auditLog.create({ data: {
      actorUserId: actor.id, actorEmail: actor.email,
      action, entityType: "SigningSession", entityId: String(signingSessionId),
      summary: action === "SIGNING_SESSION_CREATED" ? "Sesión de firma creada" : "Sesión de firma cancelada",
      metadata: { memberId, signingSessionId, reason,
        ...(replacementSigningSessionId === undefined ? {} : { replacementSigningSessionId }) },
    } });
  } catch (error) {
    // Audit FK failures are infrastructure errors, not session creation conflicts.
    // Preserve rollback without entering the route's P2003 domain handler.
    throw new Error("Signing session audit failed", { cause: error });
  }
}

export async function createOrReissueSigningSession(input: {
  memberId: number; templateId: number; documentSnapshotId: string; actor: Actor;
}) {
  return prisma.$transaction(async (tx) => {
    await lockSigningMember(tx, input.memberId);
    const templates = await tx.$queryRaw<{ id: number; documentSnapshotId: string | null }[]>`
      SELECT "id", "documentSnapshotId" FROM "ContractTemplate"
      WHERE "id" = ${input.templateId} FOR SHARE
    `;
    if (!templates[0] || templates[0].documentSnapshotId !== input.documentSnapshotId) {
      throw new SigningTemplateError("SIGNING_TEMPLATE_CHANGED");
    }
    const cancelled = await tx.$queryRaw<{ id: number }[]>`
      UPDATE "SigningSession" SET "status" = 'CANCELLED'
      WHERE "memberId" = ${input.memberId} AND "status" = 'PENDING'
      RETURNING "id"
    `;
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
    const session = await tx.signingSession.create({
      data: {
        token: crypto.randomBytes(24).toString("hex"), memberId: input.memberId,
        contractTemplateId: input.templateId, documentSnapshotId: input.documentSnapshotId,
        expiresAt: new Date(clock.now.getTime() + SIGNING_SESSION_TTL_HOURS * 3_600_000),
      },
      include: { member: true, contract: true, contractTemplate: true },
    });
    for (const previous of cancelled) {
      await audit(tx, input.actor, "SIGNING_SESSION_CANCELLED", input.memberId, previous.id, "REISSUE", session.id);
    }
    await audit(tx, input.actor, "SIGNING_SESSION_CREATED", input.memberId, session.id,
      cancelled.length ? "REISSUE" : "NEW_LINK");
    return session;
  });
}

export async function cancelSigningSession(memberId: number, signingSessionId: number, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    await lockSigningMember(tx, memberId);
    const session = await tx.signingSession.findUnique({ where: { id: signingSessionId } });
    if (!session || session.memberId !== memberId) throw new SigningLifecycleError(404, "SIGNING_SESSION_NOT_FOUND");
    if (session.status === "CANCELLED") return { id: session.id, status: session.status };
    if (session.status !== "PENDING") throw new SigningLifecycleError(409, "SIGNING_SESSION_NOT_PENDING");
    const result = await tx.signingSession.updateMany({
      where: { id: signingSessionId, memberId, status: "PENDING" }, data: { status: "CANCELLED" },
    });
    if (result.count !== 1) throw new SigningLifecycleError(409, "SIGNING_SESSION_NOT_PENDING");
    await audit(tx, actor, "SIGNING_SESSION_CANCELLED", memberId, signingSessionId, "ADMIN_CANCEL");
    return { id: signingSessionId, status: "CANCELLED" };
  });
}

export async function claimSigningSession(tx: Prisma.TransactionClient, input: {
  id: number; memberId: number; templateId: number; documentSnapshotId: string; signatureImage: string;
}) {
  await lockSigningMember(tx, input.memberId);
  // Acquire the row lock BEFORE evaluating the DB clock, including waits on
  // writers outside this module. CURRENT_TIMESTAMP would use transaction start.
  await tx.$queryRaw`SELECT "id" FROM "SigningSession" WHERE "id" = ${input.id} FOR UPDATE`;
  const rows = await tx.$queryRaw<{ id: number }[]>`
    UPDATE "SigningSession"
    SET "status" = 'SIGNED', "signatureImage" = ${input.signatureImage}, "signedAt" = clock_timestamp()
    WHERE "id" = ${input.id} AND "memberId" = ${input.memberId} AND "status" = 'PENDING'
      AND "contractTemplateId" = ${input.templateId}
      AND "documentSnapshotId" = ${input.documentSnapshotId}::uuid
      AND "expiresAt" > clock_timestamp()
    RETURNING "id"
  `;
  if (!rows.length) {
    const expired = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "SigningSession" WHERE "id" = ${input.id} AND "expiresAt" <= clock_timestamp()
    `;
    if (expired.length) throw new SigningLifecycleError(410, "SIGNING_SESSION_EXPIRED");
  }
  return { count: rows.length };
}
