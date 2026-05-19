"use client";

import Link from "next/link";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import type {
  DashboardAlert,
  DashboardAuditLog,
  DashboardData,
} from "@/lib/types";
import { useEffect, useState } from "react";

function formatCurrency(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function alertClassName(alert: DashboardAlert) {
  switch (alert.severity) {
    case "danger":
      return "border-red-200 bg-red-50 text-red-900";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

function actionTone(action: DashboardAuditLog["action"]) {
  if (action.includes("REOPEN")) {
    return "text-amber-700 bg-amber-100";
  }

  if (action.includes("DELETE") || action.includes("CANCEL")) {
    return "text-red-700 bg-red-100";
  }

  return "text-emerald-700 bg-emerald-100";
}

const adminQuickLinks = [
  { href: "/sales", label: "TPV", description: "Registrar ventas" },
  { href: "/cash", label: "Caja", description: "Cierre y movimientos" },
  { href: "/stock/counts", label: "Conteos", description: "Inventario abierto" },
  { href: "/stock", label: "Stock", description: "Niveles y ajustes" },
  { href: "/admin/audit", label: "Auditoria", description: "Trazabilidad" },
  { href: "/members/new", label: "Alta socio", description: "Nuevo miembro" },
];

const staffQuickLinks = [
  { href: "/sales", label: "TPV", description: "Registrar ventas" },
  { href: "/members", label: "Socios", description: "Buscar y consultar" },
  { href: "/access", label: "Acceso", description: "Entradas y salidas" },
  { href: "/stock", label: "Stock", description: "Stock bajo" },
];

function QuickLinks({
  links,
}: {
  links: Array<{ href: string; label: string; description: string }>;
}) {
  return (
    <section className="app-panel-strong rounded-[2rem] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Accesos rapidos</h2>
          <p className="mt-1 text-sm app-muted">Atajos a las tareas del turno.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-[1.5rem] border border-black/8 bg-white/80 p-4 hover:-translate-y-0.5 hover:border-black/12"
          >
            <div className="text-base font-black">{link.label}</div>
            <div className="mt-1 text-sm app-muted">{link.description}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      const json = await fetchJson<DashboardData>("/api/dashboard");
      setData(json);
      setError("");
    } catch (err) {
      console.error("[dashboard] Error loading /api/dashboard", err);
      setError(
        err instanceof Error
          ? `No se pudo cargar el dashboard: ${err.message}`
          : "No se pudo cargar el dashboard"
      );
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <PageHeader
          title="Dashboard"
          description="Resumen diario del club para abrir el dia con criterio operativo."
        />
        <EmptyState message={error} />
      </main>
    );
  }

  if (!data) {
    return <main className="p-6 app-muted">Cargando dashboard...</main>;
  }

  const isAdmin = data.role === "ADMIN";
  const quickLinks = isAdmin ? adminQuickLinks : staffQuickLinks;

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <PageHeader
          title="Dashboard operativo"
          description="Vista reducida para STAFF con accesos directos y alertas operativas basicas."
        />

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Socios con acceso hoy" value={data.summary.activeMembersToday} />
          <StatCard label="Dentro ahora" value={data.summary.currentInsideCount} />
          <StatCard label="Ventas hoy" value={data.summary.salesTodayCount} />
          <StatCard
            label="Stock bajo"
            value={data.summary.lowStockProductsCount}
            className={data.summary.lowStockProductsCount > 0 ? "bg-red-50" : "bg-emerald-50"}
          />
        </section>

        <QuickLinks links={quickLinks} />

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="app-panel rounded-[2rem] p-5">
            <h2 className="text-lg font-black">Stock bajo</h2>
            <p className="mt-1 text-sm app-muted">
              Productos por debajo del minimo configurado.
            </p>

            <div className="mt-4 space-y-2">
              {data.lowStockProducts.length === 0 ? (
                <EmptyState message="Sin alertas de stock." className="rounded-[1.5rem]" />
              ) : (
                data.lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between rounded-[1.25rem] border border-black/8 bg-white/80 p-3"
                  >
                    <div>
                      <div className="font-semibold">{product.name}</div>
                      <div className="text-sm app-muted">
                        Minimo {product.minStock.toFixed(2)} {product.unit}
                      </div>
                    </div>
                    <div className="font-black text-red-700">
                      {product.stock.toFixed(2)} {product.unit}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="app-panel rounded-[2rem] p-5">
            <h2 className="text-lg font-black">Ultimos accesos</h2>
            <p className="mt-1 text-sm app-muted">
              Movimiento reciente de socios en el acceso.
            </p>

            <div className="mt-4 space-y-2">
              {data.recentAccessLogs.length === 0 ? (
                <EmptyState message="Sin accesos registrados." className="rounded-[1.5rem]" />
              ) : (
                data.recentAccessLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-[1.25rem] border border-black/8 bg-white/80 p-3"
                  >
                    <div>
                      <div className="font-semibold">{log.member.fullName}</div>
                      <div className="text-sm app-muted">{log.member.dni}</div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          log.type === "IN"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {log.type}
                      </div>
                      <div className="mt-1 text-xs app-muted">{formatTime(log.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Dashboard ejecutivo diario"
        description={`Corte generado ${formatDateTime(data.generatedAt)} con foco en ventas, caja, inventario y trazabilidad.`}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ventas hoy"
          value={formatCurrency(data.summary.salesTodayTotal)}
          className="bg-emerald-50"
          valueClassName="text-3xl font-black text-emerald-800"
        />
        <StatCard label="Tickets hoy" value={data.summary.salesTodayCount} />
        <StatCard
          label="Beneficio hoy"
          value={formatCurrency(data.summary.profitToday)}
          className={data.summary.profitToday >= 0 ? "bg-sky-50" : "bg-red-50"}
          valueClassName={
            data.summary.profitToday >= 0
              ? "text-3xl font-black text-sky-800"
              : "text-3xl font-black text-red-800"
          }
        />
        <StatCard
          label="Descuentos hoy"
          value={formatCurrency(data.summary.discountsTodayTotal)}
        />
      </section>

      <QuickLinks links={quickLinks} />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="app-panel-strong rounded-[2rem] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Caja del dia</h2>
              <p className="mt-1 text-sm app-muted">
                Estado actual del cierre y caja esperada.
              </p>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                data.cash?.dayClosureStatus === "CLOSED"
                  ? "bg-emerald-100 text-emerald-800"
                  : data.cash?.dayClosureStatus === "REOPENED"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-sky-100 text-sky-800"
              }`}
            >
              {data.cash?.dayClosureStatus}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-xs uppercase tracking-[0.18em] app-muted">Caja esperada</div>
              <div className="mt-2 text-2xl font-black">
                {formatCurrency(data.cash?.cashExpectedToday || 0)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-xs uppercase tracking-[0.18em] app-muted">Balance caja</div>
              <div className="mt-2 text-2xl font-black">
                {formatCurrency(data.cash?.cashBalanceToday || 0)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-xs uppercase tracking-[0.18em] app-muted">Gastos caja</div>
              <div className="mt-2 text-2xl font-black text-red-700">
                {formatCurrency(data.cash?.expensesTodayTotal || 0)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-xs uppercase tracking-[0.18em] app-muted">Diferencia cierre</div>
              <div
                className={`mt-2 text-2xl font-black ${
                  Number(data.cash?.dayClosureDifference || 0) === 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {data.cash?.dayClosureDifference === null
                  ? "Pendiente"
                  : formatCurrency(data.cash?.dayClosureDifference || 0)}
              </div>
            </div>
          </div>
        </section>

        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Inventario</h2>
          <p className="mt-1 text-sm app-muted">
            Conteos de hoy y estado de stock minimo.
          </p>

          <div className="mt-4 grid gap-3">
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Conteos abiertos</div>
              <div className="mt-1 text-3xl font-black">
                {data.inventory.openInventoryCountsCount}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Conteos confirmados hoy</div>
              <div className="mt-1 text-3xl font-black">
                {data.inventory.confirmedInventoryCountsToday}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Productos en stock bajo</div>
              <div className="mt-1 text-3xl font-black text-red-700">
                {data.summary.lowStockProductsCount}
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Alertas</h2>
          <p className="mt-1 text-sm app-muted">
            Incidencias que requieren seguimiento hoy.
          </p>

          <div className="mt-4 space-y-3">
            {data.pendingAlerts.length === 0 ? (
              <EmptyState
                message="Sin alertas operativas pendientes."
                className="rounded-[1.5rem]"
              />
            ) : (
              data.pendingAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-[1.5rem] border p-4 ${alertClassName(alert)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black">{alert.title}</div>
                      <div className="mt-1 text-sm">{alert.description}</div>
                    </div>
                    {alert.href ? (
                      <Link
                        href={alert.href}
                        className="rounded-full border border-current/15 px-3 py-1 text-xs font-bold"
                      >
                        Abrir
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Ultimas acciones</h2>
          <p className="mt-1 text-sm app-muted">
            Ultimos eventos de auditoria registrados en el sistema.
          </p>

          <div className="mt-4 space-y-3">
            {data.recentAuditLogs.length === 0 ? (
              <EmptyState
                message="Sin eventos recientes de auditoria."
                className="rounded-[1.5rem]"
              />
            ) : (
              data.recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{log.summary}</div>
                      <div className="mt-1 text-sm app-muted">
                        {log.actorUser?.name || log.actorEmail || "Sistema"} ·{" "}
                        {log.entityType}
                        {log.entityId ? ` #${log.entityId}` : ""}
                      </div>
                    </div>
                    <div
                      className={`rounded-full px-3 py-1 text-xs font-bold ${actionTone(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </div>
                  </div>
                  <div className="mt-2 text-xs app-muted">
                    {formatDateTime(log.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Actividad de socios</h2>
          <p className="mt-1 text-sm app-muted">
            Acceso de hoy y personas actualmente dentro.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Socios con acceso IN hoy</div>
              <div className="mt-1 text-3xl font-black">{data.summary.activeMembersToday}</div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Dentro ahora</div>
              <div className="mt-1 text-3xl font-black">{data.summary.currentInsideCount}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {data.recentAccessLogs.length === 0 ? (
              <EmptyState message="Sin accesos recientes." className="rounded-[1.5rem]" />
            ) : (
              data.recentAccessLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-[1.25rem] border border-black/8 bg-white/85 p-3"
                >
                  <div>
                    <div className="font-semibold">{log.member.fullName}</div>
                    <div className="text-sm app-muted">{log.member.dni}</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                        log.type === "IN"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {log.type}
                    </div>
                    <div className="mt-1 text-xs app-muted">{formatTime(log.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Stock bajo</h2>
          <p className="mt-1 text-sm app-muted">
            Prioridades de reposicion o ajuste de inventario.
          </p>

          <div className="mt-4 grid gap-2">
            {data.lowStockProducts.length === 0 ? (
              <EmptyState message="Sin alertas de stock." className="rounded-[1.5rem]" />
            ) : (
              data.lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-[1.25rem] border border-black/8 bg-white/85 p-3"
                >
                  <div>
                    <div className="font-semibold">{product.name}</div>
                    <div className="text-sm app-muted">
                      Minimo {product.minStock.toFixed(2)} {product.unit}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-red-700">
                      {product.stock.toFixed(2)} {product.unit}
                    </div>
                    <div className="text-xs app-muted">{product.category}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
