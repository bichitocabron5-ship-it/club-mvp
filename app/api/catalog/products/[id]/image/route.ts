import {
  CATALOG_SESSION_COOKIE,
  isCatalogSessionValid,
} from "@/lib/catalog-session";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { resolveStorageUrlForResponse } from "@/lib/storage";
import { CATALOG_EXCLUDED_CATEGORY_VALUES } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = checkRateLimit({
    namespace: "catalog-product-image:get:ip",
    key: getClientIp(req),
    limit: 60,
    windowMs: 60_000,
  });

  if (!limit.ok) {
    return rateLimitResponse(limit);
  }

  const sessionCookie = req.cookies.get(CATALOG_SESSION_COOKIE)?.value;

  if (!isCatalogSessionValid(sessionCookie)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      active: true,
      category: {
        notIn: [...CATALOG_EXCLUDED_CATEGORY_VALUES],
      },
    },
    select: {
      imageUrl: true,
    },
  });

  if (!product?.imageUrl) {
    return NextResponse.json({ error: "Imagen no disponible" }, { status: 404 });
  }

  const imageUrl = await resolveStorageUrlForResponse(product.imageUrl, {
    context: "api/catalog/products/[id]/image",
  });

  if (!imageUrl) {
    return NextResponse.json(
      { error: "Imagen no disponible temporalmente" },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { imageUrl },
    {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    }
  );
}
