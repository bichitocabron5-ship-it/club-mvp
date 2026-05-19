import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditValue =
  | string
  | number
  | boolean
  | null
  | AuditValue[]
  | { [key: string]: AuditValue };

type CreateAuditLogInput = {
  actorUserId?: number | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  summary: string;
  metadata?: Prisma.JsonValue;
};

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|service[_-]?key|api[_-]?key|authorization|cookie|session|hash|signature|dni|phone|address|email|image|file|pdf|url)/i;
const REDACTED = "[REDACTED]";

function sanitizeString(value: string) {
  return value.length > 500 ? `${value.slice(0, 497)}...` : value;
}

function sanitizeAuditValue(
  value: Prisma.JsonValue | undefined,
  depth = 0
): AuditValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (depth >= 4) {
    return "[TRUNCATED]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeAuditValue(item, depth + 1) ?? null);
  }

  const entries = Object.entries(value).slice(0, 50);

  return Object.fromEntries(
    entries.map(([key, nestedValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED];
      }

      return [key, sanitizeAuditValue(nestedValue, depth + 1) ?? null];
    })
  );
}

export async function createAuditLog(input: CreateAuditLogInput) {
  const action = input.action.trim();
  const entityType = input.entityType.trim();
  const summary = input.summary.trim();

  if (!action || !entityType || !summary) {
    return;
  }

  const actorUserId =
    input.actorUserId && Number.isInteger(input.actorUserId) && input.actorUserId > 0
      ? input.actorUserId
      : null;
  const actorEmail = input.actorEmail?.trim().toLowerCase() || null;
  const entityId =
    input.entityId === undefined || input.entityId === null
      ? null
      : sanitizeString(String(input.entityId).trim());
  const metadata = sanitizeAuditValue(input.metadata);

  try {
    await prisma.auditLog.create({
      data: {
        actorUserId,
        actorEmail,
        action,
        entityType,
        entityId,
        summary: sanitizeString(summary),
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error("Audit log creation failed", {
      action,
      entityType,
      entityId,
      error,
    });
  }
}
