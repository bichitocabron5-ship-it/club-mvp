export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_PRODUCT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function isAllowedProductImageType(type: string) {
  return ALLOWED_PRODUCT_IMAGE_TYPES.includes(
    type as (typeof ALLOWED_PRODUCT_IMAGE_TYPES)[number]
  );
}

export function getProductImageExtension(type: string) {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export function buildProductImagePath(productId: number, extension: string) {
  return `products/${productId}/main.${extension}`;
}

export function buildProductImageFolder(productId: number) {
  return `products/${productId}`;
}
