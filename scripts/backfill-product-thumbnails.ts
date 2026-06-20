import "dotenv/config";

import { prisma } from "../lib/prisma";
import {
  buildProductThumbnailPath,
  createProductThumbnail,
  isStorageUrlsDisabled,
  parseStorageUrl,
  uploadBufferToStorage,
} from "../lib/storage";
import { getSupabaseAdmin } from "../lib/supabase-admin";

const APPLY_CHANGES = process.env.BACKFILL_PRODUCT_THUMBNAILS_APPLY === "true";
const DEFAULT_LIMIT = 50;

function getLimit() {
  const rawLimit = process.env.BACKFILL_PRODUCT_THUMBNAILS_LIMIT;

  if (!rawLimit) {
    return DEFAULT_LIMIT;
  }

  const limit = Number(rawLimit);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("BACKFILL_PRODUCT_THUMBNAILS_LIMIT debe ser un entero positivo.");
  }

  return limit;
}

async function main() {
  if (isStorageUrlsDisabled()) {
    throw new Error("DISABLE_STORAGE_URLS=true: backfill cancelado.");
  }

  const limit = getLimit();
  const products = await prisma.product.findMany({
    where: {
      imageUrl: {
        not: null,
      },
      thumbnailUrl: null,
    },
    orderBy: {
      id: "asc",
    },
    take: limit,
    select: {
      id: true,
      name: true,
      imageUrl: true,
    },
  });

  console.log(`Productos candidatos: ${products.length}`);

  if (!APPLY_CHANGES) {
    console.log(
      "DRY-RUN: no se descarga, sube ni actualiza nada. Define BACKFILL_PRODUCT_THUMBNAILS_APPLY=true para ejecutar."
    );
  }

  const supabaseAdmin = APPLY_CHANGES ? getSupabaseAdmin() : null;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of products) {
    const imageRef = parseStorageUrl(product.imageUrl);

    if (!imageRef) {
      skipped += 1;
      console.warn(`[skip] ${product.id} ${product.name}: imageUrl no parseable.`);
      continue;
    }

    if (!APPLY_CHANGES) {
      console.log(
        `[dry-run] ${product.id} ${product.name}: generaria products/${product.id}/thumb-*.webp`
      );
      continue;
    }

    try {
      const downloaded = await supabaseAdmin!.storage
        .from(imageRef.bucket)
        .download(imageRef.path);

      if (downloaded.error || !downloaded.data) {
        throw new Error(downloaded.error?.message || "No se pudo descargar imagen.");
      }

      const imageBuffer = Buffer.from(await downloaded.data.arrayBuffer());
      const thumbnail = await createProductThumbnail(
        imageBuffer,
        downloaded.data.type || undefined
      );
      const timestamp = Date.now();
      const thumbnailPath = buildProductThumbnailPath(
        product.id,
        timestamp,
        thumbnail.extension
      );
      const uploaded = await uploadBufferToStorage(
        thumbnail.buffer,
        thumbnailPath,
        {
          bucket: imageRef.bucket,
          contentType: thumbnail.contentType,
        }
      );

      const updated = await prisma.product.updateMany({
        where: {
          id: product.id,
          thumbnailUrl: null,
        },
        data: {
          thumbnailUrl: uploaded.storageRef,
        },
      });

      if (updated.count === 0) {
        skipped += 1;
        console.log(
          `[skip] ${product.id} ${product.name}: ya tenia thumbnailUrl al actualizar.`
        );
        continue;
      }

      created += 1;
      console.log(
        `[ok] ${product.id} ${product.name}: ${uploaded.storageRef} (${thumbnail.buffer.length} bytes)`
      );
    } catch (error) {
      failed += 1;
      console.error(
        `[error] ${product.id} ${product.name}: ${
          error instanceof Error ? error.message : "error desconocido"
        }`
      );
    }
  }

  console.log("");
  console.log("Resumen backfill miniaturas:");
  console.table({
    candidates: products.length,
    created,
    skipped,
    failed,
    apply: APPLY_CHANGES,
  });
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Error desconocido en backfill."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
