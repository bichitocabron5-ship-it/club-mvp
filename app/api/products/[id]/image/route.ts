import {
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_MAX_SIZE_BYTES,
  buildProductImageFolder,
  buildProductImagePath,
  getProductImageExtension,
  isAllowedProductImageType,
} from "@/lib/product-images";
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase-admin";
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
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
    select: { id: true },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const formData = await req.formData();
  const image = getUploadedImage(formData);

  if (image === "INVALID") {
    return NextResponse.json({ error: "Archivo invalido" }, { status: 400 });
  }

  if (!image) {
    return NextResponse.json({ error: "Debes adjuntar una imagen" }, { status: 400 });
  }

  if (!isAllowedProductImageType(image.type)) {
    return NextResponse.json(
      { error: "Solo se permiten imagenes JPG, PNG o WEBP." },
      { status: 400 }
    );
  }

  if (image.size > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "La imagen supera el limite de 5 MB." },
      { status: 400 }
    );
  }

  const extension = getProductImageExtension(image.type);

  if (!extension) {
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  }

  const folder = buildProductImageFolder(productId);
  const existing = await supabaseAdmin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .list(folder, {
      limit: 20,
    });

  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  if (existing.data.length > 0) {
    const removal = await supabaseAdmin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .remove(existing.data.map((file) => `${folder}/${file.name}`));

    if (removal.error) {
      return NextResponse.json({ error: removal.error.message }, { status: 500 });
    }
  }

  const path = buildProductImagePath(productId, extension);
  const upload = await supabaseAdmin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, Buffer.from(await image.arrayBuffer()), {
      contentType: image.type,
      upsert: true,
    });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      imageUrl: data.publicUrl,
    },
  });

  await createAuditLog({
    actorUserId: Number(auth.session.user.id),
    actorEmail: auth.session.user.email,
    action: "PRODUCT_IMAGE_UPLOADED",
    entityType: "Product",
    entityId: updated.id,
    summary: `Imagen subida para producto: ${updated.name}`,
    metadata: {
      hasImage: Boolean(updated.imageUrl),
    },
  });

  return NextResponse.json(updated);
}
