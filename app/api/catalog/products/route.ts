import {
  CATALOG_SESSION_COOKIE,
  isCatalogSessionValid,
} from "@/lib/catalog-session";
import { prisma } from "@/lib/prisma";
import type { CatalogProductSummary } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

function getApproximateStockLabel(stock: number, minStock: number) {
  if (stock <= 0) {
    return "Agotado";
  }

  if (stock <= minStock) {
    return "Poco stock";
  }

  if (stock <= minStock * 3) {
    return "Disponible";
  }

  return "En stock";
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get(CATALOG_SESSION_COOKIE)?.value;

  if (!isCatalogSessionValid(sessionCookie)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: {
      active: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      hashType: true,
      price: true,
      unit: true,
      stock: true,
      minStock: true,
      imageUrl: true,
    },
  });

  const catalogProducts: CatalogProductSummary[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category as CatalogProductSummary["category"],
    hashType: product.hashType as CatalogProductSummary["hashType"],
    price: product.price,
    unit: product.unit as CatalogProductSummary["unit"],
    imageUrl: product.imageUrl,
    stockLabel: getApproximateStockLabel(product.stock, product.minStock),
  }));

  return NextResponse.json(catalogProducts);
}
