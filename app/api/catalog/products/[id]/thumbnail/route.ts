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
import {
  createStorageSignedUrl,
  isStorageUrlsDisabled,
  parseStorageUrl,
  STORAGE_CACHEABLE_IMAGE_CACHE_CONTROL,
  STORAGE_CACHEABLE_IMAGE_TTL_SECONDS,
} from "@/lib/storage";
import { CATALOG_EXCLUDED_CATEGORY_VALUES } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = checkRateLimit({
    namespace: "catalog-product-thumbnail:get:ip",
    key: getClientIp(req),
    limit: 180,
    windowMs: 60_000,
  });

  if (!limit.ok) {
    return rateLimitResponse(limit);
  }

  const sessionCookie = req.cookies.get(CATALOG_SESSION_COOKIE)?.value;

  if (!isCatalogSessionValid(sessionCookie)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (isStorageUrlsDisabled()) {
    return NextResponse.json(
      { error: "Imagen no disponible temporalmente" },
      { status: 503 }
    );
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
      thumbnailUrl: true,
    },
  });

  if (!product?.thumbnailUrl) {
    return NextResponse.json({ error: "Miniatura no disponible" }, { status: 404 });
  }

  const thumbnailRef = parseStorageUrl(product.thumbnailUrl);

  if (!thumbnailRef) {
    return NextResponse.json({ error: "Miniatura no disponible" }, { status: 404 });
  }

  const thumbnailUrl = await createStorageSignedUrl(thumbnailRef, {
    context: "api/catalog/products/[id]/thumbnail",
    expiresIn: STORAGE_CACHEABLE_IMAGE_TTL_SECONDS,
  });

  if (!thumbnailUrl) {
    return NextResponse.json(
      { error: "Miniatura no disponible temporalmente" },
      { status: 503 }
    );
  }

  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: thumbnailUrl,
      "Cache-Control": STORAGE_CACHEABLE_IMAGE_CACHE_CONTROL,
    },
  });
}
