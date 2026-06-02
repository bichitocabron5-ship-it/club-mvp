import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  buildProductImagePath,
  getImageExtension,
  parseStorageUrl,
  uploadImageToStorage,
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
    },
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
    const path = buildProductImagePath(productId, timestamp, extension);
    const uploaded = await uploadImageToStorage(image, path);

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        imageUrl: uploaded.publicUrl,
      },
    });

    const previousRef = parseStorageUrl(product.imageUrl);
    if (previousRef) {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.storage.from(previousRef.bucket).remove([previousRef.path]);
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
      },
    });

    return NextResponse.json({
      id: updated.id,
      imageUrl: updated.imageUrl,
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
