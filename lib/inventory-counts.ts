import type { InventoryCount, InventoryCountItem, Product, AppUser } from "@prisma/client";

export const INVENTORY_COUNT_TYPES = ["PARTIAL", "FULL", "CLOSING", "AUDIT"] as const;
export const INVENTORY_COUNT_STATUSES = ["OPEN", "CONFIRMED", "CANCELLED"] as const;

type InventoryCountWithRelations = InventoryCount & {
  createdByUser: Pick<AppUser, "id" | "name" | "email"> | null;
  confirmedByUser: Pick<AppUser, "id" | "name" | "email"> | null;
  items: Array<
    InventoryCountItem & {
      product?: Pick<Product, "id" | "name" | "unit" | "stock" | "active">;
    }
  >;
};

export function buildInventoryCountSummary(items: InventoryCountItem[]) {
  const totalItems = items.length;
  const countedItems = items.filter((item) => item.countedQty !== null).length;
  const differenceItems = items.filter(
    (item) => item.differenceQty !== null && Number(item.differenceQty) !== 0
  ).length;

  return {
    totalItems,
    countedItems,
    differenceItems,
    pendingItems: totalItems - countedItems,
  };
}

export function serializeInventoryCountListItem(count: InventoryCountWithRelations) {
  return {
    id: count.id,
    status: count.status,
    type: count.type,
    notes: count.notes,
    createdAt: count.createdAt.toISOString(),
    confirmedAt: count.confirmedAt?.toISOString() ?? null,
    cancelledAt: count.cancelledAt?.toISOString() ?? null,
    createdByUserId: count.createdByUserId,
    confirmedByUserId: count.confirmedByUserId,
    createdByUser: count.createdByUser,
    confirmedByUser: count.confirmedByUser,
    summary: buildInventoryCountSummary(count.items),
  };
}

export function serializeInventoryCountDetail(count: InventoryCountWithRelations) {
  return {
    ...serializeInventoryCountListItem(count),
    items: count.items.map((item) => ({
      id: item.id,
      inventoryCountId: item.inventoryCountId,
      productId: item.productId,
      expectedQty: Number(item.expectedQty),
      countedQty: item.countedQty === null ? null : Number(item.countedQty),
      differenceQty: item.differenceQty === null ? null : Number(item.differenceQty),
      note: item.note,
      createdAt: item.createdAt.toISOString(),
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            unit: item.product.unit,
            stock: Number(item.product.stock),
            active: item.product.active,
          }
        : null,
    })),
  };
}
