import { claimSigningSession, SigningLifecycleError } from "@/lib/signing-session-lifecycle";
import { ensureSignedContractPdf } from "@/lib/contract-pdf";
import { getPersistedMonthlyLimitG } from "@/lib/club-settings";
import { SigningTemplateError } from "@/lib/contract-storage";
import {
  MEMBER_IDENTITY_MAX_INPUT_LENGTH,
  normalizeMemberIdentity,
} from "@/lib/member-identity";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  InvalidJsonBodyError,
  readJsonBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/request-body";
import {
  isSigningSessionExpired,
  requireSessionContractTemplate,
  requireSessionDocumentSnapshot,
  serializePublicSigningSession,
} from "@/lib/signing-session";
import { isStorageUrlsDisabled } from "@/lib/storage";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const SIGNATURE_IMAGE_PREFIX = "data:image/png;base64,";
export const SIGNATURE_IMAGE_MAX_BYTES = 512 * 1024;
const SIGNATURE_PAYLOAD_MAX_BYTES = 768 * 1024;
const SIGNATURE_BASE64_MAX_CHARS = Math.ceil(SIGNATURE_IMAGE_MAX_BYTES / 3) * 4;
const PUBLIC_SIGNING_ERROR = "La sesion de firma no esta disponible";
const INVALID_SIGNING_PAYLOAD_ERROR = "No se pudo procesar la firma";
const SIGNING_SESSION_NOT_PENDING_ERROR = "SIGNING_SESSION_NOT_PENDING";

class SigningAuditError extends Error {}
class MonthlyLimitConfigurationError extends Error {}
class MonthlyLimitReadError extends Error {}
class MonthlyLimitChangedError extends Error {}

const tokenSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{48}$/i)
  .transform((value) => value.toLowerCase());

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).optional();

function isPngSignatureDataUrl(value: string) {
  if (!value.startsWith(SIGNATURE_IMAGE_PREFIX)) {
    return false;
  }

  const base64 = value.slice(SIGNATURE_IMAGE_PREFIX.length);

  if (
    !base64 ||
    base64.length > SIGNATURE_BASE64_MAX_CHARS ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) {
    return false;
  }

  const bytes = Buffer.from(base64, "base64");

  if (bytes.length === 0 || bytes.length > SIGNATURE_IMAGE_MAX_BYTES) {
    return false;
  }

  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

const signPayloadSchema = z
  .object({
    expectedDocumentSnapshotId: z.string().uuid(),
    expectedContractTemplateId: z.number().int().positive().max(2_147_483_647),
    expectedConsumptionGrams: z.number().int().positive().max(2_147_483_647),
    signatureImage: z
      .string()
      .trim()
      .max(SIGNATURE_IMAGE_PREFIX.length + SIGNATURE_BASE64_MAX_CHARS)
      .refine(isPngSignatureDataUrl),
    form: z
      .object({
        fullName: optionalText(120),
        dni: z.string().max(MEMBER_IDENTITY_MAX_INPUT_LENGTH).optional(),
        address: optionalText(240),
        birthPlace: optionalText(120),
        birthDate: optionalText(10),
        phone: optionalText(40),
        email: optionalText(254),
        // Legacy clients may send this field; it has no authority or validation.
        // The existing request byte limit still applies to the entire payload.
        consumptionGrams: z.unknown().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function publicSigningError(status: number) {
  return NextResponse.json({ error: PUBLIC_SIGNING_ERROR }, { status, headers: { "Cache-Control": "no-store" } });
}

function invalidSigningPayload(status = 400) {
  return NextResponse.json({ error: INVALID_SIGNING_PAYLOAD_ERROR }, { status, headers: { "Cache-Control": "no-store" } });
}

function isSigningSessionContractUniqueError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes("signingSessionId");
  }

  return typeof target === "string" && target.includes("signingSessionId");
}

async function ensureSignedPdfForContract(contractId: number) {
  if (isStorageUrlsDisabled()) {
    console.warn("[storage] Generacion de PDF firmado omitida por modo emergencia");
    return;
  }

  try {
    await ensureSignedContractPdf(contractId);
  } catch (error) {
    console.warn(
      "[storage] No se pudo generar PDF firmado; la firma queda guardada",
      error instanceof Error ? error.message : error
    );
  }
}

function enforceSigningRateLimit(req: Request, token: string, action: "get" | "post") {
  const ip = getClientIp(req);
  const tokenKey = token.length <= 128 ? token.toLowerCase() : "invalid-token";
  const ipLimit = checkRateLimit({
    namespace: `signing-session:${action}:ip`,
    key: ip,
    limit: action === "post" ? 12 : 120,
    windowMs: action === "post" ? 10 * 60_000 : 60_000,
  });

  if (!ipLimit.ok) {
    return rateLimitResponse(ipLimit);
  }

  const tokenLimit = checkRateLimit({
    namespace: `signing-session:${action}:token`,
    key: tokenKey,
    limit: action === "post" ? 5 : 120,
    windowMs: action === "post" ? 10 * 60_000 : 60_000,
  });

  if (!tokenLimit.ok) {
    return rateLimitResponse(tokenLimit);
  }

  return null;
}

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseBirthDate(value: string | null | undefined) {
  const trimmed = trimToNull(value);

  if (!trimmed) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "INVALID" as const;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return "INVALID" as const;
  }

  return date;
}

function hasOwnFormField(form: object, field: string) {
  return Object.prototype.hasOwnProperty.call(form, field);
}

async function getPublicSigningSession(token: string) {
  const parsedToken = tokenSchema.safeParse(token);

  if (!parsedToken.success) {
    return {
      ok: false as const,
      response: publicSigningError(404),
    };
  }

  const session = await prisma.signingSession.findUnique({
    where: { token: parsedToken.data },
    include: {
      member: true,
      contract: true,
      contractTemplate: true,
    },
  });

  if (!session) {
    return {
      ok: false as const,
      response: publicSigningError(404),
    };
  }

  if (isSigningSessionExpired(session.expiresAt)) {
    return {
      ok: false as const,
      response: publicSigningError(410),
    };
  }

  return {
    ok: true as const,
    session,
  };
}

async function getSigningSessionSuccessResponse(token: string) {
  const session = await prisma.signingSession.findUnique({
    where: { token },
    include: {
      member: true,
      contract: true,
      contractTemplate: true,
    },
  });

  if (!session) {
    return publicSigningError(404);
  }

  return NextResponse.json(await serializePublicSigningSession(session), { headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const rateLimitResult = enforceSigningRateLimit(req, token, "get");

  if (rateLimitResult) {
    return rateLimitResult;
  }

  const result = await getPublicSigningSession(token);

  if (!result.ok) {
    return result.response;
  }

  if (!result.session.contract && result.session.status !== "PENDING" && result.session.status !== "SIGNED") {
    return publicSigningError(404);
  }

  // Observation only: no document URL or signing authorization. The default GET
  // and every new-signing POST retain their fresh document availability check.
  if (new URL(req.url).searchParams.get("mode") === "status") {
    return NextResponse.json(
      { status: result.session.contract ? "SIGNED" : result.session.status },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    if (new URL(req.url).searchParams.get("mode") === "document") {
      if (result.session.contract || result.session.status !== "PENDING") return publicSigningError(409);
      requireSessionContractTemplate(result.session);
      const expected = z.string().uuid().safeParse(new URL(req.url).searchParams.get("expectedDocumentSnapshotId"));
      if (!expected.success) return invalidSigningPayload();
      if (!result.session.documentSnapshotId) throw new SigningTemplateError("SIGNING_DOCUMENT_REQUIRED");
      if (expected.data !== result.session.documentSnapshotId) throw new SigningTemplateError("SIGNING_DOCUMENT_CHANGED");
      const snapshot = await requireSessionDocumentSnapshot(result.session);
      return new Response(new Uint8Array(snapshot.bytes), { headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="contrato.pdf"',
        "Content-Length": String(snapshot.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      } });
    }
    return NextResponse.json(await serializePublicSigningSession(result.session), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof SigningTemplateError)) throw error;
    if (new URL(req.url).searchParams.get("mode") === "document") return templateErrorResponse(error);
    return await recoverConfirmedSigning(result.session.token) ?? templateErrorResponse(error);
  }
}

function templateErrorResponse(error: SigningTemplateError) {
  return NextResponse.json({ code: error.code, error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
}

// A concurrent committed signature wins over new-signing preflight errors.
async function recoverConfirmedSigning(token: string) {
  const session = await prisma.signingSession.findUnique({
    where: { token }, include: { member: true, contract: true, contractTemplate: true },
  });
  if (!session?.contract) return null;
  await ensureSignedPdfForContract(session.contract.id);
  return NextResponse.json(await serializePublicSigningSession(session), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const rateLimitResult = enforceSigningRateLimit(req, token, "post");

  if (rateLimitResult) {
    return rateLimitResult;
  }

  const sessionResult = await getPublicSigningSession(token);

  if (!sessionResult.ok) {
    return sessionResult.response;
  }

  const existingSession = sessionResult.session;

  if (existingSession.contract) {
    await ensureSignedPdfForContract(existingSession.contract.id);

    return NextResponse.json(
      await serializePublicSigningSession(existingSession),
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (existingSession.status !== "PENDING") {
    return await recoverConfirmedSigning(existingSession.token) ?? publicSigningError(409);
  }

  const rejectNewSigning = async (response: Response) =>
    await recoverConfirmedSigning(existingSession.token) ?? response;

  let body: unknown;

  try {
    body = await readJsonBodyWithLimit(req, SIGNATURE_PAYLOAD_MAX_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return rejectNewSigning(invalidSigningPayload(413));
    }

    if (error instanceof InvalidJsonBodyError) {
      return rejectNewSigning(invalidSigningPayload(400));
    }

    return rejectNewSigning(invalidSigningPayload(400));
  }

  const parsedBody = signPayloadSchema.safeParse(body);

  if (!parsedBody.success) {
    return rejectNewSigning(invalidSigningPayload(400));
  }

  let contractTemplate;
  try {
    contractTemplate = requireSessionContractTemplate(existingSession);
    if (parsedBody.data.expectedContractTemplateId !== contractTemplate.id) {
      throw new SigningTemplateError("SIGNING_TEMPLATE_CHANGED");
    }
    if (!existingSession.documentSnapshotId) throw new SigningTemplateError("SIGNING_DOCUMENT_REQUIRED");
    if (parsedBody.data.expectedDocumentSnapshotId !== existingSession.documentSnapshotId) {
      throw new SigningTemplateError("SIGNING_DOCUMENT_CHANGED");
    }
    await requireSessionDocumentSnapshot(existingSession);
  } catch (error) {
    if (!(error instanceof SigningTemplateError)) throw error;
    return rejectNewSigning(templateErrorResponse(error));
  }

  const form = parsedBody.data.form || {};
  const hasAddress = hasOwnFormField(form, "address");
  const hasBirthPlace = hasOwnFormField(form, "birthPlace");
  const hasBirthDate = hasOwnFormField(form, "birthDate");
  const hasDni = hasOwnFormField(form, "dni");
  const birthDate = hasBirthDate ? parseBirthDate(form.birthDate) : null;
  const submittedDni = hasDni ? normalizeMemberIdentity(form.dni ?? "") : null;

  if (birthDate === "INVALID") {
    return rejectNewSigning(invalidSigningPayload(400));
  }

  if (hasDni && !submittedDni) {
    return rejectNewSigning(invalidSigningPayload(400));
  }

  const previousContract = await prisma.memberContract.findFirst({
    where: { memberId: existingSession.memberId },
    orderBy: [{ signedAt: "desc" }, { id: "desc" }],
  });

  const mergedFullName = trimToNull(form.fullName) || existingSession.member.fullName;
  const mergedDni =
    submittedDni ?? normalizeMemberIdentity(existingSession.member.dni);
  const mergedPhone = trimToNull(form.phone) || existingSession.member.phone || null;
  const mergedEmail = trimToNull(form.email) || existingSession.member.email || null;
  const mergedAddress = hasAddress
    ? trimToNull(form.address)
    : previousContract?.address ?? null;
  const mergedBirthPlace = hasBirthPlace
    ? trimToNull(form.birthPlace)
    : previousContract?.birthPlace ?? null;
  const mergedBirthDate = hasBirthDate
    ? birthDate
    : previousContract?.birthDate ?? null;

  if (!mergedDni) {
    return rejectNewSigning(invalidSigningPayload(400));
  }

  let session: { contractId: number };

  try {
    session = await prisma.$transaction(async (tx) => {
      const updatedSession = await claimSigningSession(tx, {
        id: existingSession.id, memberId: existingSession.memberId,
        templateId: contractTemplate.id, documentSnapshotId: parsedBody.data.expectedDocumentSnapshotId,
        signatureImage: parsedBody.data.signatureImage,
      });

      if (updatedSession.count === 0) {
        const existingContract = await tx.memberContract.findUnique({
          where: { signingSessionId: existingSession.id },
          select: { id: true },
        });

        if (existingContract) {
          return {
            contractId: existingContract.id,
          };
        }

        const current = await tx.signingSession.findUnique({
          where: { id: existingSession.id }, include: { member: true, contract: true, contractTemplate: true },
        });
        if (current) {
          if (current.documentSnapshotId !== parsedBody.data.expectedDocumentSnapshotId) throw new SigningTemplateError("SIGNING_DOCUMENT_CHANGED");
          const currentTemplate = requireSessionContractTemplate(current);
          if (currentTemplate.id !== contractTemplate.id) throw new SigningTemplateError("SIGNING_TEMPLATE_CHANGED");
        }
        throw new Error(SIGNING_SESSION_NOT_PENDING_ERROR);
      }

      // UPDATE owns the row lock until commit; confirm the authoritative association.
      const claimed = await tx.signingSession.findUnique({
        where: { id: existingSession.id }, include: { member: true, contract: true, contractTemplate: true },
      });
      if (!claimed || claimed.memberId !== existingSession.memberId) throw new Error(SIGNING_SESSION_NOT_PENDING_ERROR);
      if (claimed.documentSnapshotId !== parsedBody.data.expectedDocumentSnapshotId) throw new SigningTemplateError("SIGNING_DOCUMENT_CHANGED");
      const claimedTemplate = requireSessionContractTemplate(claimed);
      if (claimedTemplate.id !== contractTemplate.id) throw new SigningTemplateError("SIGNING_TEMPLATE_CHANGED");

      // Claim/recover the session first, so a concurrent replay needs no settings.
      // The shared settings row lock is held through contract + audit commit.
      let authorizedMonthlyLimitG: number | null;
      try {
        authorizedMonthlyLimitG = await getPersistedMonthlyLimitG(tx);
      } catch (error) {
        throw new MonthlyLimitReadError("Monthly limit unavailable", { cause: error });
      }
      if (authorizedMonthlyLimitG === null) {
        throw new MonthlyLimitConfigurationError();
      }
      if (parsedBody.data.expectedConsumptionGrams !== authorizedMonthlyLimitG) {
        throw new MonthlyLimitChangedError();
      }

      const createdContract = await tx.memberContract.create({
        data: {
          memberId: existingSession.memberId,
          signingSessionId: existingSession.id,
          contractTemplateId: claimedTemplate.id,
          documentSnapshotId: claimed.documentSnapshotId,

          fullName: mergedFullName,
          dni: mergedDni,
          address: mergedAddress,
          birthPlace: mergedBirthPlace,
          birthDate: mergedBirthDate,
          phone: mergedPhone,
          email: mergedEmail,
          consumptionGrams: authorizedMonthlyLimitG,

          signatureImage: parsedBody.data.signatureImage,
        },
      });

      try {
        await tx.auditLog.create({
          data: {
            actorUserId: null,
            actorEmail: null,
            action: "CONTRACT_SIGNED",
            entityType: "MemberContract",
            entityId: String(createdContract.id),
            summary: "Contrato firmado",
            metadata: {
              memberId: existingSession.memberId,
              signingSessionId: existingSession.id,
              source: "PUBLIC_SIGNING",
              monthlyLimitSource: "CLUB_SETTING",
              monthlyLimitG: authorizedMonthlyLimitG,
            },
          },
        });
      } catch (error) {
        // Audit failures must roll back, never enter contract replay recovery.
        throw new SigningAuditError("Contract audit failed", { cause: error });
      }

      return {
        contractId: createdContract.id,
      };
    });
  } catch (error) {
    if (error instanceof SigningLifecycleError) return publicSigningError(error.status);
    if (error instanceof SigningTemplateError) {
      return rejectNewSigning(templateErrorResponse(error));
    }
    if (error instanceof MonthlyLimitConfigurationError) {
      return NextResponse.json({
        code: "MONTHLY_LIMIT_NOT_CONFIGURED",
        error: "No se puede completar la firma porque el límite mensual no está configurado. Contacta con el club.",
      }, { status: 503 });
    }
    if (error instanceof MonthlyLimitReadError) {
      return NextResponse.json({
        code: "MONTHLY_LIMIT_UNAVAILABLE",
        error: "No se puede consultar el límite mensual. Inténtalo de nuevo más tarde.",
      }, { status: 503 });
    }
    if (error instanceof MonthlyLimitChangedError) {
      return NextResponse.json({
        code: "MONTHLY_LIMIT_CHANGED",
        error: "El límite mensual ha cambiado. Revisa el nuevo valor antes de firmar.",
      }, { status: 409 });
    }
    if (error instanceof SigningAuditError) {
      return invalidSigningPayload(500);
    }

    if (
      error instanceof Error &&
      error.message === SIGNING_SESSION_NOT_PENDING_ERROR
    ) {
      return publicSigningError(409);
    }

    if (!isSigningSessionContractUniqueError(error)) {
      throw error;
    }

    const existingContract = await prisma.memberContract.findUnique({
      where: { signingSessionId: existingSession.id },
      select: { id: true },
    });

    if (!existingContract) {
      throw error;
    }

    session = {
      contractId: existingContract.id,
    };
  }

  await ensureSignedPdfForContract(session.contractId);

  return getSigningSessionSuccessResponse(existingSession.token);
}
