import type { DashboardAlert, DashboardAuditLog } from "@/lib/types";

export function formatCurrency(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

export function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export function formatQty(value: number, unit?: string) {
  const formatted = Number(value || 0).toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAccessType(value: string) {
  if (value === "IN") return "Entrada";
  if (value === "OUT") return "Salida";
  return value;
}

export function formatClosureStatus(value: string | undefined) {
  if (value === "PENDING") return "Apertura pendiente";
  if (value === "OPEN") return "Abierto";
  if (value === "CLOSED") return "Cerrado";
  if (value === "REOPENED") return "Reabierto";
  return value ?? "-";
}

export function alertClassName(alert: DashboardAlert) {
  switch (alert.severity) {
    case "danger":
      return "border-red-200 bg-red-50 text-red-900";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

export function actionTone(action: DashboardAuditLog["action"]) {
  if (action.includes("REOPEN")) {
    return "text-amber-700 bg-amber-100";
  }

  if (action.includes("DELETE") || action.includes("CANCEL")) {
    return "text-red-700 bg-red-100";
  }

  return "text-emerald-700 bg-emerald-100";
}

export function dashboardErrorMessage(
  err: unknown,
  verb: "cargar" | "actualizar"
) {
  const detail = err instanceof Error ? `: ${err.message}` : "";
  return `No se pudo ${verb} el panel${detail}`;
}
