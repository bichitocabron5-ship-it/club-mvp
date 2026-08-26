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
  return new Date(value).toLocaleString("es-ES");
}

export function formatClosureStatus(status: DashboardClosureStatus) {
  switch (status) {
    case "OPEN":
      return "Día abierto";
    case "CLOSED":
      return "Cierre realizado";
    case "REOPENED":
      return "Día reabierto";
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
      return "border-[#b4a78d]/30 bg-[#f3f0e9] text-[#645b4c]";
    default:
      return "border-black/10 bg-[#f7f4ee] text-[#6d6860]";
  }
}

export function closureStatusMessage(status: DashboardClosureStatus) {
  switch (status) {
    case "OPEN":
      return "El turno está abierto. El cierre queda pendiente para el final del día.";
    case "CLOSED":
      return "El cierre diario ya está guardado y bloquea nuevas retiradas del día.";
    case "REOPENED":
      return "El cierre fue reabierto. Revisa la diferencia y deja nota al volver a cerrar.";
    default:
      return "Registra la apertura con caja inicial antes de cerrar el día.";
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
  ).toLocaleTimeString("es-ES", {
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

  return `#${count.id} ${count.type} - ${status} - ${timestamp} - ${count.countedItems}/${count.totalItems} líneas`;
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
