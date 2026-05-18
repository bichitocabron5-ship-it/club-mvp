import { requireAuth } from "@/lib/auth-server";
import {
  buildMemberDocumentPath,
  buildStoredMemberDocumentRef,
  getMemberDocumentExtension,
  isAllowedMemberDocumentType,
  MEMBER_DOCUMENT_BUCKET,
  MEMBER_DOCUMENT_MAX_SIZE_BYTES,
  parseStoredMemberDocumentRef,
  type MemberDocumentSide,
} from "@/lib/member-documents";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

function getUploadedFile(formData: FormData, side: MemberDocumentSide) {
  const value = formData.get(side);

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

function validateDocumentFile(file: File) {
  if (!isAllowedMemberDocumentType(file.type)) {
    return "Solo se permiten archivos JPG, PNG o PDF.";
  }

  if (file.size > MEMBER_DOCUMENT_MAX_SIZE_BYTES) {
    return "El archivo supera el limite de 10 MB.";
  }

  return null;
}

async function uploadMemberDocument(
  memberId: number,
  side: MemberDocumentSide,
  file: File
) {
  if (!isAllowedMemberDocumentType(file.type)) {
    throw new Error("Tipo de documento no permitido");
  }

  const extension = getMemberDocumentExtension(file.type);
  const path = buildMemberDocumentPath(memberId, side, extension);
  const upload = await supabaseAdmin.storage
    .from(MEMBER_DOCUMENT_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  return buildStoredMemberDocumentRef(path);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);
  const url = new URL(req.url);
  const side = url.searchParams.get("side");

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID de socio invalido" }, { status: 400 });
  }

  if (side !== "front" && side !== "back") {
    return NextResponse.json({ error: "Documento invalido" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      dniFrontUrl: true,
      dniBackUrl: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const storedRef = parseStoredMemberDocumentRef(
    side === "front" ? member.dniFrontUrl : member.dniBackUrl
  );

  if (!storedRef) {
    return NextResponse.json(
      { error: "Documento no adjuntado" },
      { status: 404 }
    );
  }

  const download = await supabaseAdmin.storage
    .from(storedRef.bucket)
    .download(storedRef.path);

  if (download.error) {
    return NextResponse.json({ error: download.error.message }, { status: 500 });
  }

  const fileName = storedRef.path.split("/").pop() || `dni-${side}`;

  return new Response(await download.data.arrayBuffer(), {
    headers: {
      "Content-Type": download.data.type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID de socio invalido" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      dniFrontUrl: true,
      dniBackUrl: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const formData = await req.formData();
  const frontFile = getUploadedFile(formData, "front");
  const backFile = getUploadedFile(formData, "back");

  if (frontFile === "INVALID" || backFile === "INVALID") {
    return NextResponse.json(
      { error: "Formato de formulario invalido" },
      { status: 400 }
    );
  }

  if (!frontFile && !backFile) {
    return NextResponse.json(
      { error: "Debes adjuntar al menos un documento frontal o reverso." },
      { status: 400 }
    );
  }

  for (const file of [frontFile, backFile]) {
    if (!file) continue;

    const validationError = validateDocumentFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  try {
    const updates: {
      dniFrontUrl?: string;
      dniBackUrl?: string;
    } = {};
    const staleRefs: string[] = [];

    if (frontFile) {
      const nextFrontRef = await uploadMemberDocument(memberId, "front", frontFile);
      if (member.dniFrontUrl && member.dniFrontUrl !== nextFrontRef) {
        staleRefs.push(member.dniFrontUrl);
      }
      updates.dniFrontUrl = nextFrontRef;
    }

    if (backFile) {
      const nextBackRef = await uploadMemberDocument(memberId, "back", backFile);
      if (member.dniBackUrl && member.dniBackUrl !== nextBackRef) {
        staleRefs.push(member.dniBackUrl);
      }
      updates.dniBackUrl = nextBackRef;
    }

    const updatedMember = await prisma.member.update({
      where: { id: memberId },
      data: updates,
      select: {
        id: true,
        dniFrontUrl: true,
        dniBackUrl: true,
      },
    });

    const removablePaths = staleRefs
      .map((ref) => parseStoredMemberDocumentRef(ref))
      .filter((ref): ref is { bucket: string; path: string } => Boolean(ref))
      .filter((ref) => ref.bucket === MEMBER_DOCUMENT_BUCKET)
      .map((ref) => ref.path);

    if (removablePaths.length > 0) {
      await supabaseAdmin.storage.from(MEMBER_DOCUMENT_BUCKET).remove(removablePaths);
    }

    return NextResponse.json({
      member: updatedMember,
      documents: {
        frontAttached: Boolean(updatedMember.dniFrontUrl),
        backAttached: Boolean(updatedMember.dniBackUrl),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo subir el documento",
      },
      { status: 500 }
    );
  }
}
