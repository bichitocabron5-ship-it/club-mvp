import {
  CATALOG_SESSION_COOKIE,
  createCatalogSessionValue,
  getCatalogSessionCookieOptions,
  hasCatalogPasswordConfigured,
  isCatalogPasswordValid,
} from "@/lib/catalog-session";
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
import { NextResponse } from "next/server";
import { z } from "zod";

const CATALOG_LOGIN_MAX_BODY_BYTES = 4 * 1024;
const CATALOG_LOGIN_ERROR = "No se pudo abrir el catalogo";

const catalogLoginSchema = z.object({
  password: z.string().min(1).max(256),
});

export async function POST(req: Request) {
  const limit = checkRateLimit({
    namespace: "catalog-session:post:ip",
    key: getClientIp(req),
    limit: 10,
    windowMs: 10 * 60_000,
  });

  if (!limit.ok) {
    return rateLimitResponse(limit);
  }

  if (!hasCatalogPasswordConfigured()) {
    return NextResponse.json(
      { error: "Catalogo no disponible" },
      { status: 503 }
    );
  }

  let body: unknown;

  try {
    body = await readJsonBodyWithLimit(req, CATALOG_LOGIN_MAX_BODY_BYTES);
  } catch (error) {
    if (
      error instanceof RequestBodyTooLargeError ||
      error instanceof InvalidJsonBodyError
    ) {
      return NextResponse.json({ error: CATALOG_LOGIN_ERROR }, { status: 400 });
    }

    return NextResponse.json({ error: CATALOG_LOGIN_ERROR }, { status: 400 });
  }

  const parsed = catalogLoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: CATALOG_LOGIN_ERROR }, { status: 400 });
  }

  if (!isCatalogPasswordValid(parsed.data.password)) {
    return NextResponse.json({ error: CATALOG_LOGIN_ERROR }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    CATALOG_SESSION_COOKIE,
    createCatalogSessionValue(),
    getCatalogSessionCookieOptions()
  );

  return response;
}

export async function DELETE(req: Request) {
  const limit = checkRateLimit({
    namespace: "catalog-session:delete:ip",
    key: getClientIp(req),
    limit: 60,
    windowMs: 60_000,
  });

  if (!limit.ok) {
    return rateLimitResponse(limit);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(CATALOG_SESSION_COOKIE, "", {
    ...getCatalogSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
