import {
  CATALOG_SESSION_COOKIE,
  createCatalogSessionValue,
  getCatalogSessionCookieOptions,
  hasCatalogPasswordConfigured,
  isCatalogPasswordValid,
} from "@/lib/catalog-session";
import { NextResponse } from "next/server";
import { z } from "zod";

const catalogLoginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(req: Request) {
  if (!hasCatalogPasswordConfigured()) {
    return NextResponse.json(
      { error: "CATALOG_PASSWORD no configurada" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = catalogLoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Password invalida" }, { status: 400 });
  }

  if (!isCatalogPasswordValid(parsed.data.password)) {
    return NextResponse.json({ error: "Password incorrecta" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    CATALOG_SESSION_COOKIE,
    createCatalogSessionValue(),
    getCatalogSessionCookieOptions()
  );

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CATALOG_SESSION_COOKIE, "", {
    ...getCatalogSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
