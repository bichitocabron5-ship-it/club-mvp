import type { DayClosure, Prisma } from "@prisma/client";

export type DashboardServiceInputDto = {
  role: string;
};

export type DashboardSaleRecord = {
  id: number;
  memberId: number;
  qty: number;
  totalAmount: number;
  finalAmount: number | null;
  originalAmount: number | null;
  discountAmount: number;
  discountPercent: number;
  unitCost: number;
  profit: number;
  createdAt: Date;
  member: {
    fullName: string;
    dni: string;
  };
  product: {
    id: number;
    name: string;
    unit: string;
  };
};

export type DashboardProductAggregateDto = {
  productId: number;
  name: string;
  unit: string;
  qty: number;
  revenue: number;
  profit: number;
  salesCount: number;
  marginIsEstimated: boolean;
};

export type DashboardMemberAggregateDto = {
  memberId: number;
  fullName: string;
  dni: string;
  salesCount: number;
  totalAmount: number;
  totalQty: number;
  profit: number;
  marginIsEstimated: boolean;
};

export type DashboardRawSaleRecord = Prisma.SaleGetPayload<{
  select: {
    id: true;
    memberId: true;
    qty: true;
    totalAmount: true;
    finalAmount: true;
    originalAmount: true;
    discountAmount: true;
    discountPercent: true;
    unitCost: true;
    profit: true;
    createdAt: true;
    member: {
      select: {
        fullName: true;
        dni: true;
      };
    };
    product: {
      select: {
        id: true;
        name: true;
        unit: true;
      };
    };
  };
}>;

export type DashboardProductRecord = Prisma.ProductGetPayload<{
  select: {
    id: true;
    name: true;
    unit: true;
    price: true;
    stock: true;
    reserveStock: true;
    averageCost: true;
    minStock: true;
    imageUrl: true;
    category: true;
    hashType: true;
    active: true;
    createdAt: true;
  };
}>;

export type DashboardMemberAccessStateRecord = {
  accessLogs: Array<{
    type: string;
  }>;
};

export type DashboardAuditLogRecord = Prisma.AuditLogGetPayload<{
  include: {
    actorUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>;

export type DashboardAccessLogRecord = Prisma.AccessLogGetPayload<{
  include: {
    member: {
      select: {
        fullName: true;
        dni: true;
      };
    };
  };
}>;

export type DashboardAccessInRecord = {
  memberId: number;
};

export type DashboardSevenDaySaleRecord = Prisma.SaleGetPayload<{
  select: {
    createdAt: true;
    totalAmount: true;
    finalAmount: true;
    profit: true;
    unitCost: true;
  };
}>;

export type DashboardSevenDayCashMoveRecord = Prisma.CashMoveGetPayload<{
  select: {
    day: true;
    createdAt: true;
    type: true;
    amount: true;
    source: true;
    note: true;
  };
}>;

export type DashboardQueryResultDto = {
  dayClosureSummary: Awaited<
    ReturnType<typeof import("@/lib/day-closure").buildTodayDayClosureSummary>
  >;
  dayClosure: DayClosure | null;
  sales: DashboardRawSaleRecord[];
  products: DashboardProductRecord[];
  members: DashboardMemberAccessStateRecord[];
  recentAuditLogs: DashboardAuditLogRecord[];
  recentAccessLogs: DashboardAccessLogRecord[];
  accessInToday: DashboardAccessInRecord[];
  sevenDaySales: DashboardSevenDaySaleRecord[];
  sevenDayCashMoves: DashboardSevenDayCashMoveRecord[];
};
