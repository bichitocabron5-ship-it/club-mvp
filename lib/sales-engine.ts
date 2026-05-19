import { Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  DAILY_LIMIT_G,
  DAILY_LIMIT_UD,
  getDailyTotals,
  getMemberSalePricing,
  getTodayRange,
  normalizeDiscountPercent,
  normalizeUnit,
  roundCurrency,
} from "@/lib/sales";

type SaleEngineItemInput = {
  productId: number;
  qty: number;
};

type CreateSaleTransactionInput = {
  memberId: number;
  items: SaleEngineItemInput[];
  operatorUserId: number;
  operatorEmail?: string | null;
  manualDiscount?: number | null;
  note?: string | null;
};

type TransactionMember = {
  id: number;
  fullName: string;
  active: boolean;
  expiresAt: Date | null;
  commercialProfile: string;
  discountPercent: number;
};

type ProductRecord = {
  id: number;
  name: string;
  unit: string;
  price: number;
  stock: number;
  averageCost: number;
};

type EngineSalePricing = {
  originalAmount: number;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
  discountSource: "NONE" | "MEMBER_PROFILE" | "MANUAL";
  discountReason: string | null;
};

type PreparedLine = {
  productId: number;
  qty: number;
  product: ProductRecord;
  pricing: EngineSalePricing;
  unitCost: number;
  profit: number;
  previousStock: number;
  newStock: number;
};

function assertPositiveNumber(value: number, fallback: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(fallback);
  }
}

async function getSaleMemberStatusTx(
  tx: Prisma.TransactionClient,
  memberId: number
) {
  const [member, contract] = await Promise.all([
    tx.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        fullName: true,
        active: true,
        expiresAt: true,
        commercialProfile: true,
        discountPercent: true,
      },
    }),
    tx.memberContract.findFirst({
      where: { memberId },
      select: { id: true },
    }),
  ]);

  if (!member) {
    throw new Error("Socio no encontrado");
  }

  if (!member.active) {
    throw new Error("Socio no activo");
  }

  if (member.expiresAt && member.expiresAt < new Date()) {
    throw new Error("Membresia caducada");
  }

  if (!contract) {
    throw new Error("El socio no ha firmado el contrato");
  }

  return member satisfies TransactionMember;
}

function getLinePricing(
  qty: number,
  unitPrice: number,
  member: TransactionMember,
  manualDiscount?: number | null
): EngineSalePricing {
  if (manualDiscount === undefined || manualDiscount === null) {
    return getMemberSalePricing(qty, unitPrice, member);
  }

  const discountPercent = normalizeDiscountPercent(manualDiscount);
  const originalAmount = roundCurrency(qty * unitPrice);
  const discountAmount = roundCurrency(originalAmount * (discountPercent / 100));
  const finalAmount = roundCurrency(originalAmount - discountAmount);

  return {
    originalAmount,
    discountPercent,
    discountAmount,
    finalAmount,
    discountSource: discountPercent > 0 ? ("MANUAL" as const) : ("NONE" as const),
    discountReason: discountPercent > 0 ? "MANUAL" : null,
  };
}

export async function createSaleTransaction({
  memberId,
  items,
  operatorUserId,
  operatorEmail,
  manualDiscount,
  note,
}: CreateSaleTransactionInput) {
  if (!Number.isInteger(memberId) || memberId <= 0) {
    throw new Error("Socio invalido");
  }

  if (!Number.isInteger(operatorUserId) || operatorUserId <= 0) {
    throw new Error("Usuario invalido");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("La venta debe incluir al menos un producto");
  }

  for (const item of items) {
    if (!Number.isInteger(item.productId) || item.productId <= 0) {
      throw new Error("Producto invalido");
    }

    assertPositiveNumber(item.qty, "Cantidad invalida");
  }

  if (manualDiscount !== undefined && manualDiscount !== null) {
    normalizeDiscountPercent(manualDiscount);
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const { start, day } = getTodayRange();

      const todayClosed = await tx.dayClosure.findUnique({
        where: { day },
      });

      if (todayClosed) {
        throw new Error(
          "El dia esta cerrado. No se pueden registrar mas retiradas."
        );
      }

      const member = await getSaleMemberStatusTx(tx, memberId);
      normalizeDiscountPercent(Number(member.discountPercent || 0));

      const grouped = new Map<number, number>();

      for (const item of items) {
        grouped.set(item.productId, (grouped.get(item.productId) || 0) + item.qty);
      }

      const groupedItems = Array.from(grouped.entries()).map(([productId, qty]) => ({
        productId,
        qty,
      }));

      const products = await tx.product.findMany({
        where: {
          id: { in: groupedItems.map((item) => item.productId) },
        },
        select: {
          id: true,
          name: true,
          unit: true,
          price: true,
          stock: true,
          averageCost: true,
        },
      });

      if (products.length !== groupedItems.length) {
        throw new Error("Algun producto no existe");
      }

      const productMap = new Map<number, ProductRecord>(
        products.map((product) => [
          product.id,
          {
            ...product,
            stock: Number(product.stock),
            price: Number(product.price),
            averageCost: Number(product.averageCost || 0),
          },
        ])
      );

      const salesToday = await tx.sale.findMany({
        where: {
          memberId,
          createdAt: { gte: start },
        },
        include: {
          product: true,
        },
      });

      const { grams: todayG, units: todayUD } = getDailyTotals(salesToday);

      let cartG = 0;
      let cartUD = 0;
      const preparedLines: PreparedLine[] = [];

      for (const item of groupedItems) {
        const product = productMap.get(item.productId);

        if (!product) {
          throw new Error("Producto invalido");
        }

        const unit = normalizeUnit(product.unit);

        if (!unit) {
          throw new Error(`Unidad invalida: ${product.name}`);
        }

        if (unit === "UD" && !Number.isInteger(item.qty)) {
          throw new Error(`El producto ${product.name} requiere unidades enteras`);
        }

        if (product.stock < item.qty) {
          throw new Error(`Stock insuficiente: ${product.name}`);
        }

        if (unit === "G") {
          cartG += item.qty;
        }

        if (unit === "UD") {
          cartUD += item.qty;
        }

        const rawPricing = getLinePricing(
          item.qty,
          product.price,
          member,
          manualDiscount
        );
        const pricing: EngineSalePricing = rawPricing;
        const unitCost = roundCurrency(product.averageCost);
        const profit = roundCurrency(rawPricing.finalAmount - item.qty * unitCost);
        const previousStock = product.stock;
        const newStock = roundCurrency(previousStock - item.qty);

        preparedLines.push({
          productId: item.productId,
          qty: item.qty,
          product,
          pricing,
          unitCost,
          profit,
          previousStock,
          newStock,
        });
      }

      if (todayG + cartG > DAILY_LIMIT_G) {
        throw new Error(`Limite diario de gramos superado (${DAILY_LIMIT_G} g)`);
      }

      if (todayUD + cartUD > DAILY_LIMIT_UD) {
        throw new Error(
          `Limite diario de unidades superado (${DAILY_LIMIT_UD} ud)`
        );
      }

      const defaultLineNote =
        note?.trim() || (preparedLines.length === 1 ? "Retirada simple" : "Retirada en carrito");
      const cashNote =
        note?.trim() ||
        (preparedLines.length === 1
          ? `Retirada - ${member.fullName}`
          : `Retirada multiple - ${member.fullName}`);

      const sales = [];
      let originalAmount = 0;
      let discountAmount = 0;
      let finalAmount = 0;
      let profit = 0;

      for (const line of preparedLines) {
        const updated = await tx.product.updateMany({
          where: {
            id: line.productId,
            stock: {
              gte: line.qty,
            },
          },
          data: {
            stock: {
              decrement: line.qty,
            },
          },
        });

        if (updated.count === 0) {
          throw new Error(`Stock insuficiente: ${line.product.name}`);
        }

        const sale = await tx.sale.create({
          data: {
            memberId,
            productId: line.productId,
            qty: line.qty,
            totalAmount: line.pricing.finalAmount,
            unitCost: line.unitCost,
            profit: line.profit,
            note: defaultLineNote,
            originalAmount: line.pricing.originalAmount,
            discountPercent: line.pricing.discountPercent,
            discountAmount: line.pricing.discountAmount,
            finalAmount: line.pricing.finalAmount,
            discountReason: line.pricing.discountReason,
            discountSource: line.pricing.discountSource,
            appliedByUserId: operatorUserId,
          },
        });

        await tx.stockMove.create({
          data: {
            productId: line.productId,
            type: "OUT",
            qty: line.qty,
            previousStock: line.previousStock,
            newStock: line.newStock,
            note: defaultLineNote,
          },
        });

        originalAmount = roundCurrency(
          originalAmount + line.pricing.originalAmount
        );
        discountAmount = roundCurrency(
          discountAmount + line.pricing.discountAmount
        );
        finalAmount = roundCurrency(finalAmount + line.pricing.finalAmount);
        profit = roundCurrency(profit + line.profit);
        sales.push(sale);
      }

      await tx.cashMove.create({
        data: {
          type: "income",
          amount: finalAmount,
          note: cashNote,
        },
      });

      return {
        memberId,
        sales,
        originalAmount,
        discountAmount,
        finalAmount,
        totalAmount: finalAmount,
        profit,
        itemCount: preparedLines.length,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  await createAuditLog({
    actorUserId: operatorUserId,
    actorEmail: operatorEmail,
    action: "SALE_CREATED",
    entityType: "Sale",
    entityId:
      result.sales.length === 1
        ? result.sales[0]?.id
        : result.sales.map((sale) => sale.id).join(","),
    summary: `Venta creada para socio #${result.memberId}`,
    metadata: {
      memberId: result.memberId,
      saleIds: result.sales.map((sale) => sale.id),
      itemCount: result.itemCount,
      originalAmount: result.originalAmount,
      discountAmount: result.discountAmount,
      finalAmount: result.finalAmount,
      totalAmount: result.totalAmount,
    },
  });

  return result;
}
