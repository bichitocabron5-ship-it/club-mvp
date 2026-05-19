import { createHmac, timingSafeEqual } from "node:crypto";

export const CATALOG_SESSION_COOKIE = "catalog_session";
export const CATALOG_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function getCatalogPassword() {
  return process.env.CATALOG_PASSWORD?.trim() ?? "";
}

function buildSignature(payload: string) {
  return createHmac("sha256", getCatalogPassword()).update(payload).digest("hex");
}

export function hasCatalogPasswordConfigured() {
  return getCatalogPassword().length > 0;
}

export function isCatalogPasswordValid(input: string) {
  const configuredPassword = getCatalogPassword();

  if (!configuredPassword) {
    return false;
  }

  const inputBuffer = Buffer.from(input);
  const configuredBuffer = Buffer.from(configuredPassword);

  if (inputBuffer.length !== configuredBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, configuredBuffer);
}

export function createCatalogSessionValue(now = Date.now()) {
  const expiresAt = String(now + CATALOG_SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${buildSignature(expiresAt)}`;
}

export function isCatalogSessionValid(value: string | undefined | null, now = Date.now()) {
  if (!value) {
    return false;
  }

  const [expiresAt, signature] = value.split(".");

  if (!expiresAt || !signature) {
    return false;
  }

  const expectedSignature = buildSignature(expiresAt);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  const expiresAtMs = Number(expiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs > now;
}

export function getCatalogSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CATALOG_SESSION_MAX_AGE_SECONDS,
  };
}
