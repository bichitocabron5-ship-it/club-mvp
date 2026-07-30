import {
  CASH_MOVE_SOURCES,
  normalizeCashMoveSource,
} from "@/lib/cash-move";
import type {
  CashMove,
  DashboardClosureStatus,
  DayClosureInventoryOption,
} from "@/lib/types";

export const SIGNIFICANT_CASH_DIFFERENCE_EUR = 1;

export type CashMoveGroups = {
  todayMoves: CashMove[];
  groupedMoves: Record<string, CashMove[]>;
  orderedGroups: string[];
};

export function formatCurrency(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

export function formatQty(value: number, unit: string) {
  return `${Number(value || 0).toFixed(2)} ${unit}`;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function formatClosureStatus(status: DashboardClosureStatus) {
  switch (status) {
    case "OPEN":
      return "Dia abierto";
    case "CLOSED":
      return "Cierre realizado";
    case "REOPENED":
      return "Dia reabierto";
    default:
      return "Apertura pendiente";
  }
}

export function closureStatusClassName(status: DashboardClosureStatus) {
  switch (status) {
    case "CLOSED":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "REOPENED":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "OPEN":
      return "border-blue-200 bg-blue-50 text-blue-900";
    default:
      return "border-gray-200 bg-gray-50 text-gray-800";
  }
}

export function closureStatusMessage(status: DashboardClosureStatus) {
  switch (status) {
    case "OPEN":
      return "El turno esta abierto. El cierre queda pendiente para el final del dia.";
    case "CLOSED":
      return "El cierre diario ya esta guardado y bloquea nuevas retiradas del dia.";
    case "REOPENED":
      return "El cierre fue reabierto. Revisa la diferencia y deja nota al volver a cerrar.";
    default:
      return "Registra la apertura con caja inicial antes de cerrar el dia.";
  }
}

export function formatSourceLabel(source: CashMove["source"]) {
  switch (normalizeCashMoveSource(source)) {
    case "SALE":
      return "Ventas";
    case "SALE_CANCELLED":
      return "Ventas anuladas";
    case "EXPENSE":
      return "Gastos";
    case "EXPENSE_CANCELLED":
      return "Gastos anulados";
    case "PURCHASE_PAYMENT":
      return "Pagos de compras";
    case "MANUAL":
      return "Manuales";
    case "ADJUSTMENT":
      return "Ajustes";
    default:
      return "Otros";
  }
}

export function formatPaymentMethodLabel(
  paymentMethod: CashMove["paymentMethod"]
) {
  switch ((paymentMethod || "CASH").toUpperCase()) {
    case "CARD":
      return "Tarjeta";
    case "TRANSFER":
      return "Transferencia";
    case "OTHER":
      return "Otro";
    default:
      return "Efectivo";
  }
}

export function formatInventoryLabel(count: DayClosureInventoryOption) {
  const timestamp = new Date(
    count.confirmedAt ?? count.createdAt
  ).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const status =
    count.status === "OPEN"
      ? "Abierto"
      : count.status === "CONFIRMED"
        ? "Confirmado"
        : count.status === "CANCELLED"
          ? "Cancelado"
          : count.status;

  return `#${count.id} ${count.type} - ${status} - ${timestamp} - ${count.countedItems}/${count.totalItems} lineas`;
}

export function getCountedCashValue(countedCash: string) {
  const countedNumber = Number(countedCash);
  return Number.isFinite(countedNumber) ? countedNumber : 0;
}

export function getDraftCashDifference(
  countedValue: number,
  expectedCash: number
) {
  return Number((countedValue - expectedCash).toFixed(2));
}

export function getCashReportHref(day: string | null | undefined) {
  return day
    ? `/api/day-closure/report?day=${encodeURIComponent(day)}&format=csv`
    : "/api/day-closure/report?format=csv";
}

function isTodayCashMove(move: CashMove) {
  const date = new Date(move.createdAt);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function buildCashMoveGroups(moves: CashMove[]): CashMoveGroups {
  const todayMoves = moves.filter(isTodayCashMove);
  const groupedMoves = todayMoves.reduce<Record<string, CashMove[]>>(
    (acc, move) => {
      const key = normalizeCashMoveSource(move.source, {
        type: move.type,
        note: move.note,
      });
      acc[key] = acc[key] ? [...acc[key], move] : [move];
      return acc;
    },
    {}
  );
  const orderedGroups = [
    ...CASH_MOVE_SOURCES.filter((source) => groupedMoves[source]?.length),
    ...Object.keys(groupedMoves).filter(
      (source) =>
        !CASH_MOVE_SOURCES.includes(
          source as (typeof CASH_MOVE_SOURCES)[number]
        )
    ),
  ];

  return {
    todayMoves,
    groupedMoves,
    orderedGroups,
  };
}
