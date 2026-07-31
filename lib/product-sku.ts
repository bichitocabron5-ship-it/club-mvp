import { Prisma } from "@prisma/client";

export const PRODUCT_SKU_MAX_LENGTH = 32;
export const PRODUCT_SKU_DUPLICATE_MESSAGE =
  "Ya existe un producto con ese SKU";

export function normalizeProductSku(value: string | null | undefined) {
  if (value === undefined) return undefined;

  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function isProductSkuUniqueConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes("sku");
  }

  return typeof target === "string" && target.includes("sku");
}
