import {
  CATALOG_SESSION_COOKIE,
  isCatalogSessionValid,
} from "@/lib/catalog-session";
import { prisma } from "@/lib/prisma";
import {
  CATALOG_EXCLUDED_CATEGORY_VALUES,
  type CatalogProductSummary,
} from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get(CATALOG_SESSION_COOKIE)?.value;

  if (!isCatalogSessionValid(sessionCookie)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: {
      active: true,
      category: {
        notIn: [...CATALOG_EXCLUDED_CATEGORY_VALUES],
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sku: true,
      description: true,
      category: true,
      hashType: true,
      price: true,
      unit: true,
      imageUrl: true,
    },
  });

  const catalogProducts: CatalogProductSummary[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    category: product.category as CatalogProductSummary["category"],
    hashType: product.hashType as CatalogProductSummary["hashType"],
    price: product.price,
    unit: product.unit as CatalogProductSummary["unit"],
    imageUrl: product.imageUrl,
  }));

  return NextResponse.json(catalogProducts);
}
