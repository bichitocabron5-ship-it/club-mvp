export type ProductUnit = "G" | "UD";

export type MemberSummary = {
  id: number;
  fullName: string;
  dni: string;
  phone: string | null;
  active: boolean;
  hasContract: boolean;
  joinedAt: string;
  expiresAt: string | null;
  createdAt: string;
  rfidCode: string | null;
};

export type ProductSummary = {
  id: number;
  name: string;
  unit: ProductUnit;
  price: number;
  stock: number;
  category: string;
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
  note: string | null;
  createdAt: string;
};

export type DashboardSale = {
  id: number;
  qty: number;
  totalAmount: number;
  member: {
    fullName: string;
  };
  product: {
    name: string;
    unit: ProductUnit | string;
  };
};

export type DashboardData = {
  income: number;
  expense: number;
  balance: number;
  salesCount: number;
  activeMembersToday: number;
  lowStock: ProductSummary[];
  lastSales: DashboardSale[];
};

export type MemberContractRecord = {
  id: number;
  fullName: string;
  dni: string;
  consumptionGrams: number | null;
  signatureImage: string;
  signedAt: string;
  signedPdfUrl: string | null;
};

export type MemberHistorySale = {
  id: number;
  qty: number;
  totalAmount: number;
  createdAt: string;
  product: {
    name: string;
    unit: ProductUnit | string;
  };
};

export type MemberHistoryData = {
  member: {
    id: number;
    fullName: string;
    dni: string;
    phone: string | null;
    email: string | null;
    active: boolean;
    joinedAt: string | null;
    expiresAt: string | null;
    rfidCode: string | null;
    createdAt: string;
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
  member: MemberSummary;
  contract?: MemberContractRecord | null;
};

export type AccessLogRecord = {
  id: number;
  memberId: number;
  type: "IN" | "OUT" | string;
  createdAt: string;
};