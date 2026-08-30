import { createHash } from "node:crypto";

import { Prisma, SaleOperationType } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { getClubSettings } from "@/lib/club-settings";
import { formatLocalDay } from "@/lib/cash-move";
import { isClosureOpen } from "@/lib/day-closure";
import { prisma } from "@/lib/prisma";
import {
  getDailyTotals,
  getMemberSalePricing,
  getTodayRange,
  normalizeDiscountPercent,
  normalizeUnit,
  roundCurrency,
} from "@/lib/sales";

const SALE_OPERATION_STATUS_SUCCEEDED = "SUCCEEDED";
const SALE_OPERATION_UNIQUE_CONSTRAINT =
  "SaleOperation_operatorUserId_idempotencyKey_key";
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { SaleOperationType };

export class IdempotencyConflictError extends Error {
  constructor(message = "Clave de idempotencia reutilizada de forma invalida") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export function isIdempotencyConflictError(
  error: unknown
): error is IdempotencyConflictError {
  return error instanceof IdempotencyConflictError;
}

type SaleEngineItemInput = {
  productId: number;
  qty: number;
};

type CreateSaleTransactionInput = {
  memberId: number;
  items: SaleEngineItemInput[];
  operatorUserId: number;
  operatorEmail?: string | null;
  operationType: SaleOperationType;
  idempotencyKey?: string | null;
  manualDiscount?: number | null;
  note?: string | null;
};

const saleResponseSelect = {
  id: true,
  memberId: true,
  productId: true,
  qty: true,
  totalAmount: true,
  unitCost: true,
  profit: true,
  note: true,
  createdAt: true,
  originalAmount: true,
  discountPercent: true,
  discountAmount: true,
  finalAmount: true,
  discountReason: true,
  discountSource: true,
  appliedByUserId: true,
  cancelledAt: true,
  cancelledByUserId: true,
  cancelReason: true,
  updatedAt: true,
} satisfies Prisma.SaleSelect;

type SaleRecord = Prisma.SaleGetPayload<{
  select: typeof saleResponseSelect;
}>;

type SaleResponse = Omit<SaleRecord, "createdAt" | "cancelledAt" | "updatedAt"> & {
  createdAt: string;
  cancelledAt: string | null;
  updatedAt: string;
};

type SaleOperationResponse = {
  memberId: number;
  sales: SaleResponse[];
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  totalAmount: number;
  profit: number;
  itemCount: number;
};

type SaleTransactionResult = SaleOperationResponse & {
  idempotentReplay: boolean;
  saleOperationId: number | null;
};

type TransactionMember = {
  id: number;
  fullName: string;
  active: boolean;
  expiresAt: Date | null;
  commercialProfile: string;
  discountPercent: number;
  monthlyLimitG: number | null;
};

type ProductRecord = {
  id: number;
  active: boolean;
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

function normalizeSaleOperationType(value: SaleOperationType) {
  if (
    value !== SaleOperationType.SINGLE &&
    value !== SaleOperationType.BULK
  ) {
    throw new Error("Tipo de operacion de venta invalido");
  }

  return value;
}

function assertSaleOperationShape(
  operationType: SaleOperationType,
  items: SaleEngineItemInput[]
) {
  if (operationType === SaleOperationType.SINGLE && items.length !== 1) {
    throw new Error("La venta individual debe incluir un unico producto");
  }
}

function normalizeIdempotencyKey(value: string | null | undefined) {
  const key = value?.trim();

  if (!key) return null;

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new Error("Clave de idempotencia invalida");
  }

  return key.toLowerCase();
}

function normalizeSaleItemsForFingerprint(items: SaleEngineItemInput[]) {
  const grouped = new Map<number, number>();

  for (const item of items) {
    grouped.set(item.productId, (grouped.get(item.productId) || 0) + item.qty);
  }

  return Array.from(grouped.entries())
    .sort(([leftProductId], [rightProductId]) => leftProductId - rightProductId)
    .map(([productId, qty]) => ({
      productId,
      qty,
    }));
}

function normalizeOptionalNoteForFingerprint(value: string | null | undefined) {
  const note = value?.trim();

  return note || null;
}

function createSaleRequestFingerprint({
  memberId,
  items,
  operationType,
  manualDiscount,
  note,
}: {
  memberId: number;
  items: SaleEngineItemInput[];
  operationType: SaleOperationType;
  manualDiscount?: number | null;
  note?: string | null;
}) {
  const canonicalRequest = {
    version: 1,
    operationType,
    memberId,
    items: normalizeSaleItemsForFingerprint(items),
    manualDiscount:
      manualDiscount === undefined || manualDiscount === null
        ? null
        : normalizeDiscountPercent(manualDiscount),
    note: normalizeOptionalNoteForFingerprint(note),
  };

  return createHash("sha256")
    .update(JSON.stringify(canonicalRequest), "utf8")
    .digest("hex");
}

function serializeSaleForResponse(sale: SaleRecord): SaleResponse {
  return {
    ...sale,
    qty: Number(sale.qty),
    totalAmount: Number(sale.totalAmount),
    unitCost: Number(sale.unitCost),
    profit: Number(sale.profit),
    originalAmount:
      sale.originalAmount === null ? null : Number(sale.originalAmount),
    discountPercent: Number(sale.discountPercent),
    discountAmount: Number(sale.discountAmount),
    finalAmount: sale.finalAmount === null ? null : Number(sale.finalAmount),
    createdAt: sale.createdAt.toISOString(),
    cancelledAt: sale.cancelledAt?.toISOString() ?? null,
    updatedAt: sale.updatedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseSaleResponse(value: unknown): SaleResponse | null {
  if (!isRecord(value)) return null;

  const id = parseNumber(value.id);
  const memberId = parseNumber(value.memberId);
  const productId = parseNumber(value.productId);
  const qty = parseNumber(value.qty);
  const totalAmount = parseNumber(value.totalAmount);
  const unitCost = parseNumber(value.unitCost);
  const profit = parseNumber(value.profit);
  const discountPercent = parseNumber(value.discountPercent);
  const discountAmount = parseNumber(value.discountAmount);

  if (
    id === null ||
    memberId === null ||
    productId === null ||
    qty === null ||
    totalAmount === null ||
    unitCost === null ||
    profit === null ||
    discountPercent === null ||
    discountAmount === null ||
    typeof value.createdAt !== "string" ||
    typeof value.discountSource !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  const originalAmount =
    value.originalAmount === null ? null : parseNumber(value.originalAmount);
  const finalAmount =
    value.finalAmount === null ? null : parseNumber(value.finalAmount);

  if (originalAmount === null && value.originalAmount !== null) return null;
  if (finalAmount === null && value.finalAmount !== null) return null;

  return {
    id,
    memberId,
    productId,
    qty,
    totalAmount,
    unitCost,
    profit,
    note: typeof value.note === "string" ? value.note : null,
    createdAt: value.createdAt,
    originalAmount,
    discountPercent,
    discountAmount,
    finalAmount,
    discountReason:
      typeof value.discountReason === "string" ? value.discountReason : null,
    discountSource: value.discountSource,
    appliedByUserId:
      value.appliedByUserId === null ? null : parseNumber(value.appliedByUserId),
    cancelledAt: typeof value.cancelledAt === "string" ? value.cancelledAt : null,
    cancelledByUserId:
      value.cancelledByUserId === null
        ? null
        : parseNumber(value.cancelledByUserId),
    cancelReason: typeof value.cancelReason === "string" ? value.cancelReason : null,
    updatedAt: value.updatedAt,
  };
}

function parseSaleOperationResponse(
  value: Prisma.JsonValue
): SaleOperationResponse | null {
  if (!isRecord(value)) return null;

  const memberId = parseNumber(value.memberId);
  const originalAmount = parseNumber(value.originalAmount);
  const discountAmount = parseNumber(value.discountAmount);
  const finalAmount = parseNumber(value.finalAmount);
  const totalAmount = parseNumber(value.totalAmount);
  const profit = parseNumber(value.profit);
  const itemCount = parseNumber(value.itemCount);

  if (
    memberId === null ||
    originalAmount === null ||
    discountAmount === null ||
    finalAmount === null ||
    totalAmount === null ||
    profit === null ||
    itemCount === null ||
    !Array.isArray(value.sales)
  ) {
    return null;
  }

  const sales = value.sales.map(parseSaleResponse);

  if (sales.some((sale) => sale === null)) {
    return null;
  }

  return {
    memberId,
    sales: sales as SaleResponse[],
    originalAmount,
    discountAmount,
    finalAmount,
    totalAmount,
    profit,
    itemCount,
  };
}

function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

function isSaleOperationIdempotencyUniqueConflict(
  error: Prisma.PrismaClientKnownRequestError
) {
  if (error.code !== "P2002") return false;

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    const fields = target.map(String);

    return (
      fields.length === 2 &&
      fields.includes("operatorUserId") &&
      fields.includes("idempotencyKey")
    );
  }

  if (typeof target === "string") {
    return target === SALE_OPERATION_UNIQUE_CONSTRAINT;
  }

  return target === undefined || target === null;
}

function shouldAttemptIdempotencyReplay(error: unknown) {
  if (!isPrismaKnownRequestError(error)) return false;

  if (error.code === "P2034") return true;

  return isSaleOperationIdempotencyUniqueConflict(error);
}

async function loadSuccessfulSaleOperationReplay({
  idempotencyKey,
  operatorUserId,
  operationType,
  requestFingerprint,
}: {
  idempotencyKey: string;
  operatorUserId: number;
  operationType: SaleOperationType;
  requestFingerprint: string;
}): Promise<SaleTransactionResult | null> {
  const operation = await prisma.saleOperation.findUnique({
    where: {
      operatorUserId_idempotencyKey: {
        operatorUserId,
        idempotencyKey,
      },
    },
    select: {
      id: true,
      operationType: true,
      requestFingerprint: true,
      response: true,
      status: true,
    },
  });

  if (!operation) return null;

  if (operation.operationType !== operationType) {
    throw new IdempotencyConflictError(
      "Clave de idempotencia reutilizada para otro tipo de retirada"
    );
  }

  if (operation.requestFingerprint !== requestFingerprint) {
    throw new IdempotencyConflictError(
      "Clave de idempotencia reutilizada con otros datos de retirada"
    );
  }

  if (
    operation.status !== SALE_OPERATION_STATUS_SUCCEEDED ||
    operation.response === null
  ) {
    throw new Error("La operacion idempotente previa no esta disponible");
  }

  const response = parseSaleOperationResponse(operation.response);

  if (!response) {
    throw new Error("La respuesta idempotente previa no es valida");
  }

  return {
    ...response,
    idempotentReplay: true,
    saleOperationId: operation.id,
  };
}

async function getSaleMemberStatusTx(
  tx: Prisma.TransactionClient,
  memberId: number
) {
  const member = await tx.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      fullName: true,
      active: true,
      expiresAt: true,
      commercialProfile: true,
      discountPercent: true,
    },
  });
  const contract = await tx.memberContract.findFirst({
    where: { memberId },
    select: { id: true, consumptionGrams: true },
    orderBy: { signedAt: "desc" },
  });

  if (!member) {
    throw new Error("Socio no encontrado");
  }

  if (!member.active) {
    throw new Error("Socio no activo");
  }

  if (member.expiresAt && member.expiresAt < new Date()) {
    throw new Error("Membresía caducada");
  }

  if (!contract) {
    throw new Error("El socio no ha firmado el contrato");
  }

  return {
    ...member,
    monthlyLimitG: contract.consumptionGrams ?? null,
  } satisfies TransactionMember;
}

function getMonthRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(1);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return { start, end };
}

function getMonthlyGramTotal(sales: Array<{ qty: number; product: { unit: string } }>) {
  return sales.reduce((total, sale) => {
    return normalizeUnit(sale.product.unit) === "G" ? total + sale.qty : total;
  }, 0);
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
  operationType,
  idempotencyKey,
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

  const normalizedOperationType = normalizeSaleOperationType(operationType);
  assertSaleOperationShape(normalizedOperationType, items);

  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  const idempotencyContext = normalizedIdempotencyKey
    ? {
        idempotencyKey: normalizedIdempotencyKey,
        requestFingerprint: createSaleRequestFingerprint({
          memberId,
          items,
          operationType: normalizedOperationType,
          manualDiscount,
          note,
        }),
      }
    : null;
  let result: SaleTransactionResult;

  try {
    result = await prisma.$transaction(
      async (tx) => {
        const saleOperation = idempotencyContext
          ? await tx.saleOperation.create({
              data: {
                operatorUserId,
                idempotencyKey: idempotencyContext.idempotencyKey,
                operationType: normalizedOperationType,
                requestFingerprint: idempotencyContext.requestFingerprint,
                memberId,
                status: SALE_OPERATION_STATUS_SUCCEEDED,
              },
              select: {
                id: true,
              },
            })
          : null;

        const { start, day } = getTodayRange();
        const { start: monthStart, end: monthEnd } = getMonthRange();

        const todayClosed = await tx.dayClosure.findUnique({
          where: { day },
        });

        if (isClosureOpen(todayClosed)) {
          throw new Error(
            "El dia esta cerrado. No se pueden registrar mas retiradas."
          );
        }

        const member = await getSaleMemberStatusTx(tx, memberId);
        normalizeDiscountPercent(Number(member.discountPercent || 0));

        const grouped = new Map<number, number>();

        for (const item of items) {
          grouped.set(
            item.productId,
            (grouped.get(item.productId) || 0) + item.qty
          );
        }

        const groupedItems = Array.from(grouped.entries()).map(
          ([productId, qty]) => ({
            productId,
            qty,
          })
        );

        const products = await tx.product.findMany({
          where: {
            id: { in: groupedItems.map((item) => item.productId) },
          },
          select: {
            id: true,
            active: true,
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

        const settings = await getClubSettings();
        const salesToday = await tx.sale.findMany({
          where: {
            memberId,
            cancelledAt: null,
            createdAt: { gte: start },
          },
          include: {
            product: true,
          },
        });
        const salesThisMonth = await tx.sale.findMany({
          where: {
            memberId,
            cancelledAt: null,
            createdAt: {
              gte: monthStart,
              lt: monthEnd,
            },
          },
          include: {
            product: true,
          },
        });

        const { grams: todayG, units: todayUD } = getDailyTotals(salesToday);
        const monthG = getMonthlyGramTotal(salesThisMonth);

        let cartG = 0;
        let cartUD = 0;
        const preparedLines: PreparedLine[] = [];

        for (const item of groupedItems) {
          const product = productMap.get(item.productId);

          if (!product) {
            throw new Error("Producto invalido");
          }

          if (!product.active) {
            throw new Error(`Producto inactivo: ${product.name}`);
          }

          const unit = normalizeUnit(product.unit);

          if (!unit) {
            throw new Error(`Unidad invalida: ${product.name}`);
          }

          if (unit === "UD" && !Number.isInteger(item.qty)) {
            throw new Error(
              `El producto ${product.name} requiere unidades enteras`
            );
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
          const unitCost = Number(product.averageCost || 0);
          const profit = roundCurrency(
            rawPricing.finalAmount - item.qty * unitCost
          );
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

        if (todayG + cartG > settings.dailyLimitG) {
          throw new Error(
            `Limite diario de gramos superado (${settings.dailyLimitG} g)`
          );
        }

        if (todayUD + cartUD > settings.dailyLimitUd) {
          throw new Error(
            `Limite diario de unidades superado (${settings.dailyLimitUd} ud)`
          );
        }

        if (
          member.monthlyLimitG !== null &&
          monthG + cartG > member.monthlyLimitG
        ) {
          throw new Error(
            `Limite mensual de gramos superado (${member.monthlyLimitG} g)`
          );
        }

        const defaultLineNote =
          note?.trim() ||
          (preparedLines.length === 1
            ? "Retirada simple"
            : "Retirada en carrito");
        const cashNote =
          note?.trim() ||
          (preparedLines.length === 1
            ? `Retirada - ${member.fullName}`
            : `Retirada multiple - ${member.fullName}`);

        const sales: SaleResponse[] = [];
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
              saleOperationId: saleOperation?.id,
            },
            select: saleResponseSelect,
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
          sales.push(serializeSaleForResponse(sale));
        }

        await tx.cashMove.create({
          data: {
            type: "income",
            amount: finalAmount,
            note: cashNote,
            source: "SALE",
            sourceId: sales.map((sale) => sale.id).join(","),
            paymentMethod: "CASH",
            createdByUserId: operatorUserId,
            day: formatLocalDay(),
          },
        });

        const response: SaleOperationResponse = {
          memberId,
          sales,
          originalAmount,
          discountAmount,
          finalAmount,
          totalAmount: finalAmount,
          profit,
          itemCount: preparedLines.length,
        };

        if (saleOperation) {
          await tx.saleOperation.update({
            where: {
              id: saleOperation.id,
            },
            data: {
              response: response as Prisma.InputJsonValue,
            },
          });
        }

        return {
          ...response,
          idempotentReplay: false,
          saleOperationId: saleOperation?.id ?? null,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  } catch (error) {
    if (idempotencyContext && shouldAttemptIdempotencyReplay(error)) {
      const replay = await loadSuccessfulSaleOperationReplay({
        idempotencyKey: idempotencyContext.idempotencyKey,
        operatorUserId,
        operationType: normalizedOperationType,
        requestFingerprint: idempotencyContext.requestFingerprint,
      });

      if (replay) return replay;
    }

    throw error;
  }

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
