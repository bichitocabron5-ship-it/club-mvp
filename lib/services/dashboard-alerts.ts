import type { DayClosure } from "@prisma/client";

import type { DashboardAlert, DashboardClosureStatus } from "@/lib/types";
import type { DayClosureSummary } from "@/lib/types";
import { roundCurrency } from "@/lib/sales";

type DashboardAlertInput = {
  day: string;
  dayClosure: DayClosure | null;
  dayClosureStatus: DashboardClosureStatus;
  dayClosureSummary: DayClosureSummary;
  highDiscountSalesCount: number;
  isAdmin: boolean;
  lowStockProductsCount: number;
};

export function buildDashboardPendingAlerts({
  day,
  dayClosure,
  dayClosureStatus,
  dayClosureSummary,
  highDiscountSalesCount,
  isAdmin,
  lowStockProductsCount,
}: DashboardAlertInput): DashboardAlert[] {
  const pendingAlerts: DashboardAlert[] = [];

  if (dayClosureStatus === "PENDING") {
    pendingAlerts.push({
      id: "day-opening-pending",
      type: "DAY_OPENING_PENDING",
      severity: "warning",
      title: "Apertura de caja pendiente",
      description: `Registra la caja inicial de ${day} antes del cierre diario.`,
      href: "/cash",
    });
  }

  if (dayClosureStatus === "OPEN") {
    pendingAlerts.push({
      id: "day-closure-pending",
      type: "DAY_CLOSURE_PENDING",
      severity: "info",
      title: "Cierre de caja pendiente",
      description: `El dia ${day} esta abierto y pendiente de cierre.`,
      href: "/cash",
    });
  }

  if (dayClosureStatus === "CLOSED") {
    pendingAlerts.push({
      id: "day-closure-closed",
      type: "DAY_CLOSED",
      severity: "info",
      title: "Caja del día cerrada",
      description: `El cierre de ${day} ya esta registrado.`,
      href: "/cash",
    });
  }

  if (dayClosureStatus === "REOPENED") {
    pendingAlerts.push({
      id: "day-closure-reopened",
      type: "DAY_REOPENED",
      severity: "warning",
      title: "Caja reabierta",
      description: `El cierre de ${day} fue reabierto y necesita seguimiento.`,
      href: "/cash",
    });
  }

  if (dayClosure && Number(dayClosure.difference) !== 0) {
    pendingAlerts.push({
      id: "cash-difference",
      type: "CASH_DIFFERENCE",
      severity: "danger",
      title: "Diferencia de caja detectada",
      description: `La diferencia actual del cierre es ${roundCurrency(
        Number(dayClosure.difference)
      ).toFixed(2)} EUR.`,
      href: "/cash",
    });
  }

  if (dayClosureSummary.inventoryCountsOpenCount > 0) {
    pendingAlerts.push({
      id: "open-inventory-counts",
      type: "OPEN_INVENTORY_COUNTS",
      severity: "warning",
      title: "Conteos de inventario abiertos",
      description: `Hay ${dayClosureSummary.inventoryCountsOpenCount} conteo(s) pendientes de cerrar hoy.`,
      href: "/stock/counts",
    });
  }

  if (lowStockProductsCount > 0) {
    pendingAlerts.push({
      id: "low-stock-products",
      type: "LOW_STOCK",
      severity: "danger",
      title: "Productos con stock bajo",
      description: `${lowStockProductsCount} producto(s) están por debajo del mínimo configurado.`,
      href: "/stock",
    });
  }

  if (highDiscountSalesCount > 0) {
    pendingAlerts.push({
      id: "high-discount-sales",
      type: "HIGH_DISCOUNT_SALES",
      severity: "warning",
      title: "Ventas con descuentos altos",
      description: `${highDiscountSalesCount} venta(s) superan el umbral de descuento del día.`,
      href: "/sales",
    });
  }

  if (isAdmin) {
    return pendingAlerts;
  }

  return pendingAlerts.filter(
    (alert) =>
      alert.type === "LOW_STOCK" || alert.type === "OPEN_INVENTORY_COUNTS"
  );
}
