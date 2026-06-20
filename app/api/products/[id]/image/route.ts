import { requireAdmin, requireAuth } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  buildProductImagePath,
  buildProductThumbnailPath,
  createProductThumbnail,
  createStorageSignedUrl,
  getImageExtension,
  isStorageUrlsDisabled,
  parseStorageUrl,
  resolveStorageUrlForResponse,
  STORAGE_CACHEABLE_IMAGE_CACHE_CONTROL,
  STORAGE_CACHEABLE_IMAGE_TTL_SECONDS,
  STORAGE_UPLOAD_DISABLED_MESSAGE,
  uploadBufferToStorage,
  validateImageFile,
} from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

function getUploadedImage(formData: FormData) {
  const value = formData.get("image");

  if (value === null) {
    return null;
  }

  if (!(value instanceof File)) {
    return "INVALID";
  }

  if (!value.size) {
    return null;
  }

  return value;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      imageUrl: true,
    },
  });

  if (!product?.imageUrl) {
    return NextResponse.json({ error: "Imagen no disponible" }, { status: 404 });
  }

  const imageUrl = await resolveStorageUrlForResponse(product.imageUrl, {
    context: "api/products/[id]/image:get",
    expiresIn: STORAGE_CACHEABLE_IMAGE_TTL_SECONDS,
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
        "Cache-Control": STORAGE_CACHEABLE_IMAGE_CACHE_CONTROL,
      },
    }
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "No hay sesion." : "No tienes permiso para editar productos." },
      { status: auth.status }
    );
  }

  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      thumbnailUrl: true,
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  if (isStorageUrlsDisabled()) {
    return NextResponse.json(
      { error: STORAGE_UPLOAD_DISABLED_MESSAGE },
      { status: 503 }
    );
  }

  const formData = await req.formData();
  const image = getUploadedImage(formData);

  if (image === "INVALID") {
    return NextResponse.json({ error: "Archivo invalido" }, { status: 400 });
  }

  if (!image) {
    return NextResponse.json({ error: "Debes adjuntar una imagen" }, { status: 400 });
  }

  const validationError = validateImageFile(image);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const extension = getImageExtension(image.type);

  if (!extension) {
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  }

  try {
    const timestamp = Date.now();
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const thumbnail = await createProductThumbnail(imageBuffer, image.type);
    const path = buildProductImagePath(productId, timestamp, extension);
    const thumbnailPath = buildProductThumbnailPath(
      productId,
      timestamp,
      thumbnail.extension
    );
    const uploaded = await uploadBufferToStorage(imageBuffer, path, {
      contentType: image.type,
    });
    const uploadedThumbnail = await uploadBufferToStorage(
      thumbnail.buffer,
      thumbnailPath,
      {
        contentType: thumbnail.contentType,
      }
    );

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        imageUrl: uploaded.storageRef,
        thumbnailUrl: uploadedThumbnail.storageRef,
      },
    });

    const previousRefs = [
      parseStorageUrl(product.imageUrl),
      parseStorageUrl(product.thumbnailUrl),
    ].filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));

    if (previousRefs.length) {
      const supabaseAdmin = getSupabaseAdmin();
      const pathsByBucket = new Map<string, string[]>();

      for (const ref of previousRefs) {
        pathsByBucket.set(ref.bucket, [
          ...(pathsByBucket.get(ref.bucket) ?? []),
          ref.path,
        ]);
      }

      await Promise.all(
        Array.from(pathsByBucket.entries()).map(([bucket, paths]) =>
          supabaseAdmin.storage.from(bucket).remove(paths)
        )
      );
    }

    await createAuditLog({
      actorUserId: Number(auth.session.user.id),
      actorEmail: auth.session.user.email,
      action: "PRODUCT_IMAGE_UPLOADED",
      entityType: "Product",
      entityId: updated.id,
      summary: `Imagen subida para producto: ${updated.name}`,
      metadata: {
        hasImage: Boolean(updated.imageUrl),
        storagePath: uploaded.path,
        thumbnailStoragePath: uploadedThumbnail.path,
        thumbnailBytes: thumbnail.buffer.length,
      },
    });

    return NextResponse.json({
      id: updated.id,
      hasImage: Boolean(updated.imageUrl),
      imageUrl: await createStorageSignedUrl(
        {
          bucket: uploaded.bucket,
          path: uploaded.path,
        },
        {
          context: "api/products/[id]/image:post",
        }
      ),
      thumbnailUrl: await createStorageSignedUrl(
        {
          bucket: uploadedThumbnail.bucket,
          path: uploadedThumbnail.path,
        },
        {
          context: "api/products/[id]/image:post:thumbnail",
          expiresIn: STORAGE_CACHEABLE_IMAGE_TTL_SECONDS,
        }
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Fallo subiendo la imagen a storage.",
      },
      { status: 500 }
    );
  }
}
