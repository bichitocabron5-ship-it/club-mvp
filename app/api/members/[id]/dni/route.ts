import { requireStaffOrAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  buildMemberDniPath,
  createStorageSignedUrl,
  getImageExtension,
  isStorageUrlsDisabled,
  parseStorageUrl,
  STORAGE_UPLOAD_DISABLED_MESSAGE,
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
      { error: auth.status === 401 ? "No hay sesion." : "No tienes permiso para gestionar socios." },
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
      dniFrontUrl: true,
      dniBackUrl: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  if (isStorageUrlsDisabled()) {
    return NextResponse.json(
      { error: STORAGE_UPLOAD_DISABLED_MESSAGE },
      { status: 503 }
    );
  }

  const formData = await req.formData();
  const sideValue = formData.get("side");
  const image = getUploadedImage(formData);

  if (sideValue !== "front" && sideValue !== "back") {
    return NextResponse.json({ error: "El campo side debe ser front o back." }, { status: 400 });
  }

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
    const path = buildMemberDniPath(memberId, sideValue, timestamp, extension);
    const uploaded = await uploadImageToStorage(image, path);

    const updatedMember = await prisma.member.update({
      where: { id: memberId },
      data:
        sideValue === "front"
          ? { dniFrontUrl: uploaded.storageRef }
          : { dniBackUrl: uploaded.storageRef },
      select: {
        id: true,
        dniFrontUrl: true,
        dniBackUrl: true,
      },
    });

    const previousRef = parseStorageUrl(
      sideValue === "front" ? member.dniFrontUrl : member.dniBackUrl
    );
    if (previousRef) {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.storage.from(previousRef.bucket).remove([previousRef.path]);
    }

    await createAuditLog({
      actorUserId: Number(auth.session.user.id),
      actorEmail: auth.session.user.email,
      action: "MEMBER_DNI_UPLOADED",
      entityType: "Member",
      entityId: updatedMember.id,
      summary: `DNI ${sideValue === "front" ? "frontal" : "trasero"} actualizado para socio #${member.memberNumber ?? member.id}`,
      metadata: {
        side: sideValue,
      },
    });

    return NextResponse.json(
      sideValue === "front"
        ? {
            dniFrontUrl: await createStorageSignedUrl(
              {
                bucket: uploaded.bucket,
                path: uploaded.path,
              },
              {
                context: "api/members/[id]/dni:front",
              }
            ),
          }
        : {
            dniBackUrl: await createStorageSignedUrl(
              {
                bucket: uploaded.bucket,
                path: uploaded.path,
              },
              {
                context: "api/members/[id]/dni:back",
              }
            ),
          }
    );
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
