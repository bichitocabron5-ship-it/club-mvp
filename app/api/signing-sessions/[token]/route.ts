import { ensureSignedContractPdf } from "@/lib/contract-pdf";
import { findActiveContractTemplate } from "@/lib/contract-templates";
import {
  MEMBER_IDENTITY_MAX_INPUT_LENGTH,
  normalizeMemberIdentity,
} from "@/lib/member-identity";
import { isUniqueConstraintError } from "@/lib/member-number";
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
        consumptionGrams: z
          .union([z.string().trim().max(6), z.number()])
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function publicSigningError(status: number) {
  return NextResponse.json({ error: PUBLIC_SIGNING_ERROR }, { status });
}

function invalidSigningPayload(status = 400) {
  return NextResponse.json({ error: INVALID_SIGNING_PAYLOAD_ERROR }, { status });
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

function parseConsumptionGrams(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (
    !Number.isInteger(numericValue) ||
    numericValue <= 0 ||
    numericValue > 1000
  ) {
    return "INVALID" as const;
  }

  return numericValue;
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
    },
  });

  if (!session) {
    return publicSigningError(404);
  }

  return NextResponse.json(await serializePublicSigningSession(session));
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

  if (result.session.status !== "PENDING" && result.session.status !== "SIGNED") {
    return publicSigningError(404);
  }

  const payload = await serializePublicSigningSession(result.session);

  if (
    !payload?.contractTemplate &&
    payload?.status !== "SIGNED" &&
    !isStorageUrlsDisabled()
  ) {
    return publicSigningError(503);
  }

  return NextResponse.json(payload);
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
      await serializePublicSigningSession(existingSession)
    );
  }

  if (existingSession.status !== "PENDING") {
    return publicSigningError(409);
  }

  const contractTemplate = await findActiveContractTemplate();

  if (!contractTemplate) {
    return publicSigningError(503);
  }

  let body: unknown;

  try {
    body = await readJsonBodyWithLimit(req, SIGNATURE_PAYLOAD_MAX_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return invalidSigningPayload(413);
    }

    if (error instanceof InvalidJsonBodyError) {
      return invalidSigningPayload(400);
    }

    return invalidSigningPayload(400);
  }

  const parsedBody = signPayloadSchema.safeParse(body);

  if (!parsedBody.success) {
    return invalidSigningPayload(400);
  }

  const form = parsedBody.data.form || {};
  const hasAddress = hasOwnFormField(form, "address");
  const hasBirthPlace = hasOwnFormField(form, "birthPlace");
  const hasBirthDate = hasOwnFormField(form, "birthDate");
  const hasDni = hasOwnFormField(form, "dni");
  const hasConsumptionGrams = hasOwnFormField(form, "consumptionGrams");
  const birthDate = hasBirthDate ? parseBirthDate(form.birthDate) : null;
  const consumptionGrams = hasConsumptionGrams
    ? parseConsumptionGrams(form.consumptionGrams)
    : null;
  const submittedDni = hasDni ? normalizeMemberIdentity(form.dni ?? "") : null;

  if (birthDate === "INVALID" || consumptionGrams === "INVALID") {
    return invalidSigningPayload(400);
  }

  if (hasDni && !submittedDni) {
    return invalidSigningPayload(400);
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
  const mergedConsumptionGrams = hasConsumptionGrams
    ? consumptionGrams
    : previousContract?.consumptionGrams ?? null;

  if (!mergedDni) {
    return invalidSigningPayload(400);
  }

  let session: { contractId: number };

  try {
    session = await prisma.$transaction(async (tx) => {
      const signedAt = new Date();
      const updatedSession = await tx.signingSession.updateMany({
        where: {
          id: existingSession.id,
          status: "PENDING",
        },
        data: {
          status: "SIGNED",
          signatureImage: parsedBody.data.signatureImage,
          signedAt,
        },
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

        throw new Error(SIGNING_SESSION_NOT_PENDING_ERROR);
      }

      await tx.member.update({
        where: { id: existingSession.memberId },
        data: {
          fullName: mergedFullName,
          dni: mergedDni,
          phone: mergedPhone,
          email: mergedEmail,
        },
      });

      const createdContract = await tx.memberContract.create({
        data: {
          memberId: existingSession.memberId,
          signingSessionId: existingSession.id,
          contractTemplateId: contractTemplate.id,

          fullName: mergedFullName,
          dni: mergedDni,
          address: mergedAddress,
          birthPlace: mergedBirthPlace,
          birthDate: mergedBirthDate,
          phone: mergedPhone,
          email: mergedEmail,
          consumptionGrams: mergedConsumptionGrams,

          signatureImage: parsedBody.data.signatureImage,
        },
      });

      return {
        contractId: createdContract.id,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === SIGNING_SESSION_NOT_PENDING_ERROR
    ) {
      return publicSigningError(409);
    }

    if (isUniqueConstraintError(error, "dni")) {
      return invalidSigningPayload(409);
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
