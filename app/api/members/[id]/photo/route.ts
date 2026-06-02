import { requireStaffOrAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  buildMemberPhotoPath,
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
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "No hay sesion." : "No tienes permiso para subir la foto del socio." },
      { status: auth.status }
    );
  }

  const { id } = await params;
  const memberId = Number(id);

  if (!Number.isInteger(memberId) || memberId <= 0) {
    return NextResponse.json({ error: "ID de socio invalido" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNumber: true,
      photoUrl: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const formData = await req.formData();
  const image = getUploadedImage(formData);

  if (image === "INVALID") {
    return NextResponse.json({ error: "Archivo invalido" }, { status: 400 });
  }

  if (!image) {
    return NextResponse.json({ error: "Debes adjuntar una imagen." }, { status: 400 });
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
    const path = buildMemberPhotoPath(memberId, timestamp, extension);
    const uploaded = await uploadImageToStorage(image, path);

    const updatedMember = await prisma.member.update({
      where: { id: memberId },
      data: { photoUrl: uploaded.publicUrl },
      select: {
        id: true,
        photoUrl: true,
      },
    });

    const previousRef = parseStorageUrl(member.photoUrl);
    if (previousRef) {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.storage.from(previousRef.bucket).remove([previousRef.path]);
    }

    await createAuditLog({
      actorUserId: Number(auth.session.user.id),
      actorEmail: auth.session.user.email,
      action: "MEMBER_PHOTO_UPLOADED",
      entityType: "Member",
      entityId: updatedMember.id,
      summary: `Foto de perfil actualizada para socio #${member.memberNumber ?? member.id}`,
      metadata: {
        storagePath: uploaded.path,
      },
    });

    return NextResponse.json({
      photoUrl: updatedMember.photoUrl,
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
