// app/api/suppliers/[id]/route.ts
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

const SUPPLIER_DELETE_BLOCKED_MESSAGE =
  "No se puede eliminar un proveedor con compras registradas. Puedes desactivarlo.";

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}, z.string().nullable().optional());

const nullableEmail = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}, z.string().email().nullable().optional());

const supplierPatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: nullableTrimmedString,
    email: nullableEmail,
    notes: nullableTrimmedString,
    active: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Debe enviarse al menos un campo",
  });

function parseSupplierId(id: string) {
  const supplierId = Number(id);

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return null;
  }

  return supplierId;
}

function isRestrictDeleteError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const supplierId = parseSupplierId(id);

  if (!supplierId) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = supplierPatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const updatedSupplier = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier) {
      return null;
    }

    const updated = await tx.supplier.update({
      where: { id: supplier.id },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        notes: parsed.data.notes,
        active: parsed.data.active,
      },
    });

    const changedFields: string[] = [];

    if (updated.name !== supplier.name) changedFields.push("name");
    if ((updated.phone ?? null) !== (supplier.phone ?? null)) {
      changedFields.push("phone");
    }
    if ((updated.email ?? null) !== (supplier.email ?? null)) {
      changedFields.push("email");
    }
    if ((updated.notes ?? null) !== (supplier.notes ?? null)) {
      changedFields.push("notes");
    }
    if (updated.active !== supplier.active) changedFields.push("active");

    const actorUserId = Number(auth.session.user.id);
    const actorEmail = auth.session.user.email;
    const editableFields = changedFields.filter((field) => field !== "active");

    if (editableFields.length > 0) {
      await createAuditLog({
        db: tx,
        actorUserId,
        actorEmail,
        action: "SUPPLIER_UPDATED",
        entityType: "Supplier",
        entityId: updated.id,
        summary: `Proveedor actualizado: ${updated.name}`,
        metadata: {
          changedFields: editableFields,
        },
      });
    }

    if (changedFields.includes("active")) {
      await createAuditLog({
        db: tx,
        actorUserId,
        actorEmail,
        action: "SUPPLIER_STATUS_CHANGED",
        entityType: "Supplier",
        entityId: updated.id,
        summary: `${updated.active ? "Proveedor activado" : "Proveedor desactivado"}: ${updated.name}`,
        metadata: {
          active: updated.active,
        },
      });
    }

    return updated;
  });

  if (!updatedSupplier) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  return NextResponse.json(updatedSupplier);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const supplierId = parseSupplierId(id);

  if (!supplierId) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  try {
    const deletedSupplier = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        include: {
          _count: {
            select: {
              purchases: true,
            },
          },
        },
      });

      if (!supplier) {
        return null;
      }

      if (supplier._count.purchases > 0) {
        return "HAS_PURCHASES" as const;
      }

      const deleted = await tx.supplier.delete({
        where: { id: supplier.id },
      });

      await createAuditLog({
        db: tx,
        actorUserId: Number(auth.session.user.id),
        actorEmail: auth.session.user.email,
        action: "SUPPLIER_DELETED",
        entityType: "Supplier",
        entityId: deleted.id,
        summary: `Proveedor eliminado: ${deleted.name}`,
        metadata: {
          purchaseCount: supplier._count.purchases,
        },
      });

      return deleted;
    });

    if (!deletedSupplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    if (deletedSupplier === "HAS_PURCHASES") {
      return NextResponse.json(
        { error: SUPPLIER_DELETE_BLOCKED_MESSAGE },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRestrictDeleteError(error)) {
      return NextResponse.json(
        { error: SUPPLIER_DELETE_BLOCKED_MESSAGE },
        { status: 409 }
      );
    }

    throw error;
  }
}
