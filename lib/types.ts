export type ProductUnit = "G" | "UD";

export const PRODUCT_CATEGORY_VALUES = [
  "CANNABIS",
  "SATIVA",
  "INDICA",
  "HYBRID",
  "CBD",
  "RESIN",
  "HASH",
  "JOINT",
  "DRINK",
  "FOOD",
  "MERCH",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORY_VALUES)[number];

export const PRODUCT_HASH_TYPE_VALUES = [
  "FROZEN",
  "STATIC",
  "DRY",
  "SEMI_DRY",
] as const;

export type ProductHashType = (typeof PRODUCT_HASH_TYPE_VALUES)[number];

export const PRODUCT_CATEGORIES: ReadonlyArray<{
  value: ProductCategory;
  label: string;
}> = [
  { value: "CANNABIS", label: "Cannabis" },
  { value: "SATIVA", label: "Sativa" },
  { value: "INDICA", label: "Indica" },
  { value: "HYBRID", label: "Híbrida" },
  { value: "CBD", label: "CBD" },
  { value: "RESIN", label: "Resin" },
  { value: "HASH", label: "Hash" },
  { value: "JOINT", label: "Joint" },
  { value: "DRINK", label: "Bebida" },
  { value: "FOOD", label: "Comida" },
  { value: "MERCH", label: "Merchandising" },
] as const;

export const PRODUCT_HASH_TYPES: ReadonlyArray<{
  value: ProductHashType;
  label: string;
}> = [
  { value: "FROZEN", label: "Frozen" },
  { value: "STATIC", label: "Static" },
  { value: "DRY", label: "Dry" },
  { value: "SEMI_DRY", label: "Semi-Dry" },
] as const;

export const CATALOG_EXCLUDED_CATEGORY_VALUES = [
  "DRINK",
  "FOOD",
  "MERCH",
] as const satisfies ReadonlyArray<ProductCategory>;

const catalogExcludedCategorySet = new Set<ProductCategory>(
  CATALOG_EXCLUDED_CATEGORY_VALUES
);

export function isCatalogVisibleCategory(category: ProductCategory) {
  return !catalogExcludedCategorySet.has(category);
}

export function getProductCategoryLabel(category: ProductCategory) {
  return (
    PRODUCT_CATEGORIES.find((item) => item.value === category)?.label ?? category
  );
}

export function getProductHashTypeLabel(hashType: ProductHashType) {
  return (
    PRODUCT_HASH_TYPES.find((item) => item.value === hashType)?.label ?? hashType
  );
}

export type CatalogSectionKey = "FLOWERS" | "HASHES" | "EXTRACTS" | "OTHER";

export function getCatalogSectionMeta(category: ProductCategory): {
  key: CatalogSectionKey;
  title: string;
  order: number;
} {
  switch (category) {
    case "CANNABIS":
    case "SATIVA":
    case "INDICA":
    case "HYBRID":
    case "CBD":
      return {
        key: "FLOWERS",
        title: "Flores / Cannabis",
        order: 1,
      };
    case "HASH":
    case "RESIN":
      return {
        key: "HASHES",
        title: "Hash / Resinas",
        order: 2,
      };
    case "JOINT":
      return {
        key: "OTHER",
        title: "Otros productos",
        order: 4,
      };
    default:
      return {
        key: "OTHER",
        title: "Otros productos",
        order: 4,
      };
  }
}

export type ProductLike = {
  id: number;
  name: string;
  unit: ProductUnit | string;
};

export type MemberSummary = {
  id: number;
  memberNumber?: string | number | null;
  fullName: string;
  dni: string;
  phone: string | null;
  email?: string | null;
  photoUrl?: string | null;
  dniFrontUrl?: string | null;
  dniBackUrl?: string | null;
  active: boolean;
  hasContract: boolean;
  joinedAt: string;
  expiresAt: string | null;
  createdAt: string;
  rfidCode: string | null;
  commercialProfile: string;
  discountPercent: number;
  commercialNotes?: string | null;
};

export type ProductSummary = {
  id: number;
  name: string;
  sku?: string | null;
  description?: string | null;
  unit: ProductUnit;
  price: number;
  stock: number;
  reserveStock: number;
  imageUrl?: string | null;
  category: ProductCategory;
  hashType: ProductHashType | null;
  minStock: number;
  active: boolean;
  createdAt?: string;
};

export type CatalogProductSummary = {
  id: number;
  name: string;
  sku?: string | null;
  description?: string | null;
  category: ProductCategory;
  hashType: ProductHashType | null;
  price: number;
  unit: ProductUnit;
  imageUrl: string | null;
};

export type CashMove = {
  id: number;
  type: "income" | "expense";
  amount: number;
  note: string | null;
  source: "SALE" | "EXPENSE" | "EXPENSE_CANCELLED" | "PURCHASE_PAYMENT" | "MANUAL" | "ADJUSTMENT" | "OTHER" | string;
  sourceId: string | null;
  paymentMethod: "CASH" | "CARD" | "TRANSFER" | "OTHER" | string;
  createdByUserId: number | null;
  day: string | null;
  createdAt: string;
  createdByUser?: {
    id: number;
    name: string;
    email: string;
  } | null;
};

export type DayClosure = {
  id: number;
  day: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  salesTotal: number;
  expensesTotal: number;
  manualCashTotal: number;
  discountsTotal: number;
  closedByUserId: number | null;
  inventoryCountId: number | null;
  reopenedAt: string | null;
  reopenedByUserId: number | null;
  reopenReason: string | null;
  note: string | null;
  createdAt: string;
};

export type DayClosureInventoryOption = {
  id: number;
  status: "OPEN" | "CONFIRMED" | "CANCELLED" | string;
  type: string;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type DayClosureSummary = {
  day: string;
  salesTotal: number;
  expensesTotal: number;
  manualCashTotal: number;
  discountsTotal: number;
  expectedCash: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  salesCount: number;
  cashMovesCount: number;
  inventoryCounts: DayClosureInventoryOption[];
  inventoryCountsOpenCount: number;
  inventoryCountsConfirmedCount: number;
};

export type DashboardSale = {
  id: number;
  qty: number;
  totalAmount: number;
  unitCost?: number;
  profit?: number;
  originalAmount?: number | null;
  discountAmount?: number;
  discountPercent?: number;
  finalAmount?: number | null;
  discountReason?: string | null;
  discountSource?: string;
  createdAt: string;
  member: {
    fullName: string;
  };
  product: {
    name: string;
    unit: ProductUnit | string;
  };
};

export type DashboardAccessLog = {
  id: number;
  type: "IN" | "OUT" | string;
  createdAt: string;
  member: {
    fullName: string;
    dni: string;
  };
};

export type DashboardExpense = {
  id: number;
  category: string;
  description: string;
  amount: number;
  paidMethod: string;
  createdAt: string;
};

export type DashboardProductStat = {
  productId: number;
  name: string;
  unit: ProductUnit | string;
  qty: number;
  revenue: number;
  profit: number;
  marginPercent: number;
  marginIsEstimated: boolean;
  salesCount: number;
};

export type DashboardMemberStat = {
  memberId: number;
  fullName: string;
  dni: string;
  salesCount: number;
  totalAmount: number;
  totalQty: number;
  profit: number;
  marginPercent: number;
  marginIsEstimated: boolean;
};

export type DashboardDailyFinance = {
  date: string;
  income: number;
  expense: number;
  grossProfit: number;
  netProfit: number;
  salesCount: number;
};

export type DashboardStockSummary = {
  availableStockValue: number;
  reserveStockValue: number;
  totalPhysicalStockValue: number;
  stockCostValue: number;
  stockCostValueEstimated: boolean;
};

export type PurchaseSummary = {
  id: number;
  supplierName: string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: string;
  createdAt: string;
};

export type RecentClosure = {
  id: number;
  day: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  note: string | null;
  createdAt: string;
};

export type DashboardAlerts = {
  membersWithoutContract: number;
  expiredMembers: number;
  blockedMembers: number;
  lowStock: number;
};

export type DashboardRole = "ADMIN" | "STAFF" | string;

export type DashboardClosureStatus = "OPEN" | "CLOSED" | "REOPENED";

export type DashboardAlert = {
  id: string;
  type:
    | "DAY_CLOSED"
    | "DAY_REOPENED"
    | "OPEN_INVENTORY_COUNTS"
    | "LOW_STOCK"
    | "CASH_DIFFERENCE"
    | "HIGH_DISCOUNT_SALES";
  severity: "info" | "warning" | "danger";
  title: string;
  description: string;
  href: string | null;
};

export type DashboardAuditLog = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  actorEmail: string | null;
  createdAt: string;
  actorUser: {
    id: number;
    name: string;
    email: string;
  } | null;
};

export type DashboardCashSummary = {
  salesTodayTotal: number;
  salesTodayCount: number;
  profitToday: number;
  marginPercent: number;
  marginIsEstimated: boolean;
  discountsTodayTotal: number;
  expensesTodayTotal: number;
  cashExpectedToday: number;
  cashBalanceToday: number;
  dayClosureStatus: DashboardClosureStatus;
  dayClosureDifference: number | null;
};

export type DashboardInventorySummary = {
  openInventoryCountsCount: number;
  confirmedInventoryCountsToday: number;
};

export type DashboardExecutiveSummary = {
  salesTodayTotal: number;
  salesTodayCount: number;
  profitToday: number;
  marginPercent: number;
  marginIsEstimated: boolean;
  discountsTodayTotal: number;
  expensesTodayTotal: number;
  activeMembersToday: number;
  currentInsideCount: number;
  lowStockProductsCount: number;
};

export type DashboardData = {
  role: DashboardRole;
  generatedAt: string;
  summary: DashboardExecutiveSummary;
  cash: DashboardCashSummary | null;
  inventory: DashboardInventorySummary;
  topProductsToday: DashboardProductStat[] | null;
  topMembersToday: DashboardMemberStat[] | null;
  recentSales: DashboardSale[] | null;
  dailyFinance: DashboardDailyFinance[] | null;
  stockSummary: DashboardStockSummary | null;
  lowStockProducts: ProductSummary[];
  recentAuditLogs: DashboardAuditLog[];
  recentAccessLogs: DashboardAccessLog[];
  pendingAlerts: DashboardAlert[];
};

export type ContractTemplateRecord = {
  id: number;
  name: string;
  version: string;
  fileUrl: string;
  active: boolean;
  createdAt: string;
};

export type MemberContractRecord = {
  id: number;
  contractTemplateId: number | null;
  fullName: string;
  dni: string;
  address?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  consumptionGrams: number | null;
  signatureImage: string;
  signedAt: string;
  signedPdfUrl: string | null;
  contractTemplate?: ContractTemplateRecord | null;
};

export type ClubSettingsRecord = {
  dailyLimitG: number;
  dailyLimitUd: number;
  defaultMonthlyLimitG: number;
};

export type MemberHistorySale = {
  id: number;
  qty: number;
  totalAmount: number;
  originalAmount: number | null;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number | null;
  discountReason: string | null;
  discountSource: string;
  createdAt: string;
  product: {
    name: string;
    unit: ProductUnit | string;
  };
};

export type MemberHistoryData = {
  member: {
    id: number;
    memberNumber?: string | number | null;
    fullName: string;
    dni: string;
    phone: string | null;
    email: string | null;
    photoUrl: string | null;
    dniFrontUrl: string | null;
    dniBackUrl: string | null;
    active: boolean;
    joinedAt: string | null;
    expiresAt: string | null;
    rfidCode: string | null;
    createdAt: string;
    commercialProfile: string;
    discountPercent: number;
    commercialNotes: string | null;
  };
  sales: MemberHistorySale[];
  totalSpent: number;
  count: number;
};

export type SigningSessionData = {
  id: number;
  token: string;
  memberId: number;
  status: "PENDING" | "SIGNED" | "CANCELLED" | string;
  signatureImage: string | null;
  signedAt: string | null;
  expiresAt: string;
  member: MemberSummary;
  contract?: MemberContractRecord | null;
  contractTemplate: ContractTemplateRecord | null;
  clubSettings?: {
    defaultMonthlyLimitG: number;
  };
};

export type PublicSigningSessionData = {
  status: "PENDING" | "SIGNED" | "CANCELLED" | string;
  member: {
    fullName: string;
    memberNumber?: string | number | null;
    displayNumber: string | number | null;
  };
  contractTemplate: {
    id: number;
    name: string;
    version: string;
    fileUrl: string;
  } | null;
  clubSettings?: {
    defaultMonthlyLimitG: number;
  };
};

export type InternalSigningSessionData = PublicSigningSessionData & {
  token: string;
  signUrl: string;
  expiresAt: string;
  signatureImage?: string | null;
};

export type AccessLogRecord = {
  id: number;
  memberId: number;
  type: "IN" | "OUT" | string;
  createdAt: string;
};

export type AccessInsideMember = {
  id: number;
  fullName: string;
  dni: string;
  lastAccessAt: string;
};

export type AccessCurrentResponse = {
  count: number;
  inside: AccessInsideMember[];
};

export type StockMoveRecord = {
  id: number;
  productId: number;
  type: "IN" | "OUT" | "ADJUST" | "TRANSFER" | "INVENTORY_ADJUSTMENT" | string;
  qty: number;
  previousStock: number;
  newStock: number;
  note: string | null;
  createdAt: string;
  product: ProductLike;
};

export type InventoryCountType = "PARTIAL" | "FULL" | "CLOSING" | "AUDIT";
export type InventoryCountStatus = "OPEN" | "CONFIRMED" | "CANCELLED";

export type InventoryCountListItem = {
  id: number;
  status: InventoryCountStatus | string;
  type: InventoryCountType | string;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdByUserId: number | null;
  confirmedByUserId: number | null;
  createdByUser: {
    id: number;
    name: string;
    email: string;
  } | null;
  confirmedByUser: {
    id: number;
    name: string;
    email: string;
  } | null;
  summary: {
    totalItems: number;
    countedItems: number;
    differenceItems: number;
    pendingItems: number;
  };
};

export type InventoryCountDetailItem = {
  id: number;
  inventoryCountId: number;
  productId: number;
  expectedQty: number;
  countedQty: number | null;
  differenceQty: number | null;
  note: string | null;
  createdAt: string;
  product: {
    id: number;
    name: string;
    unit: ProductUnit | string;
    stock: number;
    active: boolean;
  };
};

export type InventoryCountDetail = {
  id: number;
  status: InventoryCountStatus | string;
  type: InventoryCountType | string;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdByUserId: number | null;
  confirmedByUserId: number | null;
  createdByUser: {
    id: number;
    name: string;
    email: string;
  } | null;
  confirmedByUser: {
    id: number;
    name: string;
    email: string;
  } | null;
  items: InventoryCountDetailItem[];
  summary: {
    totalItems: number;
    countedItems: number;
    differenceItems: number;
    pendingItems: number;
  };
};
