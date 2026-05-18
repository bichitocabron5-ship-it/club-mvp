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
  { value: "HYBRID", label: "Hibrida" },
  { value: "CBD", label: "CBD" },
  { value: "RESIN", label: "Resin" },
  { value: "HASH", label: "Hash" },
  { value: "JOINT", label: "Joint" },
  { value: "DRINK", label: "Drink" },
  { value: "FOOD", label: "Food" },
  { value: "MERCH", label: "Merch" },
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
  unit: ProductUnit;
  price: number;
  stock: number;
  category: ProductCategory;
  hashType: ProductHashType | null;
  minStock: number;
  active: boolean;
  createdAt?: string;
};

export type CashMove = {
  id: number;
  type: "income" | "expense";
  amount: number;
  note: string | null;
  createdAt: string;
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
  note: string | null;
  createdAt: string;
};

export type DashboardSale = {
  id: number;
  qty: number;
  totalAmount: number;
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
};

export type DashboardDailyFinance = {
  date: string;
  income: number;
  expense: number;
  grossProfit: number;
  netProfit: number;
  salesCount: number;
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

export type DashboardData = {
  income: number;
  expense: number;
  balance: number;
  salesCount: number;
  grossProfit: number;
  netProfit: number;
  activeMembersToday: number;
  currentInsideCount: number;
  lowStock: ProductSummary[];
  lastSales: DashboardSale[];
  lastAccessLogs: DashboardAccessLog[];
  expensesToday: DashboardExpense[];
  expensesByCategory: Record<string, number>;
  topProductsByRevenue: DashboardProductStat[];
  topProductsByProfit: DashboardProductStat[];
  worstProductsByProfit: DashboardProductStat[];
  topMembersByAmount: DashboardMemberStat[];
  dailyFinance: DashboardDailyFinance[];
  supplierDebt: number;
  pendingPurchases: PurchaseSummary[];
  recentClosures: RecentClosure[];
  alerts: DashboardAlerts;
};

export type MemberContractRecord = {
  id: number;
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
};

export type AccessLogRecord = {
  id: number;
  memberId: number;
  type: "IN" | "OUT" | string;
  createdAt: string;
};

export type StockMoveRecord = {
  id: number;
  productId: number;
  type: "IN" | "OUT" | "ADJUST" | string;
  qty: number;
  previousStock: number;
  newStock: number;
  note: string | null;
  createdAt: string;
  product: ProductLike;
};
