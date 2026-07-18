import type {
  DashboardAccessLogRecord,
  DashboardAuditLogRecord,
  DashboardProductRecord,
  DashboardSaleRecord,
} from "@/lib/dtos/dashboard";
import type {
  DashboardAccessLog,
  DashboardAuditLog,
  DashboardSale,
  ProductCategory,
  ProductHashType,
  ProductSummary,
  ProductUnit,
} from "@/lib/types";

export function serializeDashboardProduct(
  product: DashboardProductRecord
): ProductSummary {
  return {
    id: product.id,
    name: product.name,
    unit: product.unit as ProductUnit,
    price: Number(product.price),
    stock: Number(product.stock),
    reserveStock: Number(product.reserveStock),
    imageUrl: null,
    hasImage: Boolean(product.imageUrl),
    category: product.category as ProductCategory,
    hashType: product.hashType as ProductHashType | null,
    minStock: Number(product.minStock),
    active: product.active,
    createdAt: product.createdAt.toISOString(),
  };
}

export function serializeDashboardSale(sale: DashboardSaleRecord): DashboardSale {
  return {
    id: sale.id,
    qty: sale.qty,
    totalAmount: sale.totalAmount,
    unitCost: sale.unitCost,
    profit: sale.profit,
    originalAmount: sale.originalAmount,
    discountAmount: sale.discountAmount,
    discountPercent: sale.discountPercent,
    finalAmount: sale.finalAmount,
    createdAt: sale.createdAt.toISOString(),
    member: {
      fullName: sale.member.fullName,
    },
    product: {
      name: sale.product.name,
      unit: sale.product.unit,
    },
  };
}

export function serializeDashboardAuditLog(
  log: DashboardAuditLogRecord
): DashboardAuditLog {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    summary: log.summary,
    actorEmail: log.actorEmail,
    createdAt: log.createdAt.toISOString(),
    actorUser: log.actorUser,
  };
}

export function serializeDashboardAccessLog(
  log: DashboardAccessLogRecord
): DashboardAccessLog {
  return {
    id: log.id,
    type: log.type,
    createdAt: log.createdAt.toISOString(),
    member: {
      fullName: log.member.fullName,
      dni: log.member.dni,
    },
  };
}
