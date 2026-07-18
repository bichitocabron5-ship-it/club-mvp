"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PanelLoadingSkeleton } from "@/components/dashboard/panel-loading-skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import type { DashboardAlert, DashboardAuditLog, DashboardData } from "@/lib/types";

type LoadMode = "initial" | "refresh";

function formatCurrency(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatQty(value: number, unit?: string) {
  const formatted = Number(value || 0).toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
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

function formatAccessType(value: string) {
  if (value === "IN") return "Entrada";
  if (value === "OUT") return "Salida";
  return value;
}

function formatClosureStatus(value: string | undefined) {
  if (value === "PENDING") return "Apertura pendiente";
  if (value === "OPEN") return "Abierto";
  if (value === "CLOSED") return "Cerrado";
  if (value === "REOPENED") return "Reabierto";
  return value ?? "-";
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

function dashboardErrorMessage(err: unknown, verb: "cargar" | "actualizar") {
  const detail = err instanceof Error ? `: ${err.message}` : "";
  return `No se pudo ${verb} el panel${detail}`;
}

function MarginBadge({
  marginPercent,
  estimated,
}: {
  marginPercent: number;
  estimated: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded-full bg-sky-100 px-3 py-1 font-bold text-sky-800">
        {formatPercent(marginPercent)}
      </span>
      {estimated ? <span className="app-muted">Estimado</span> : null}
    </div>
  );
}

const adminQuickLinks = [
  { href: "/sales", label: "TPV", description: "Registrar ventas" },
  { href: "/cash", label: "Caja", description: "Cierre y movimientos" },
  { href: "/stock/counts", label: "Conteos", description: "Inventario abierto" },
  { href: "/stock", label: "Stock", description: "Niveles y ajustes" },
  { href: "/admin/settings", label: "Límites", description: "Topes y consumo" },
  { href: "/admin/audit", label: "Auditoría", description: "Trazabilidad" },
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
          <h2 className="text-lg font-black">Accesos rápidos</h2>
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

function DashboardStatusBar({
  generatedAt,
  isRefreshing,
  refreshError,
  onRefresh,
}: {
  generatedAt: string;
  isRefreshing: boolean;
  refreshError: string;
  onRefresh: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-3 rounded-[1.5rem] border border-black/8 bg-white/75 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="font-semibold">
          {isRefreshing ? "Actualizando..." : "Panel actualizado"}
        </div>
        <div className="mt-1 app-muted">
          Ultima lectura: {formatDateTime(generatedAt)}
        </div>
        {refreshError ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            {refreshError}. Se mantienen los datos anteriores.
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="app-button-secondary inline-flex items-center justify-center rounded-full px-4 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRefreshing ? "Actualizando..." : "Refrescar"}
      </button>
    </div>
  );
}

export default function PanelPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [initialError, setInitialError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPanel = useCallback(async (mode: LoadMode = "initial") => {
    const isRefresh = mode === "refresh";

    if (isRefresh) {
      setIsRefreshing(true);
      setRefreshError("");
    } else {
      setIsInitialLoading(true);
      setInitialError("");
    }

    try {
      const json = await fetchJson<DashboardData>("/api/dashboard");
      setData(json);
      setInitialError("");
      setRefreshError("");
    } catch (err) {
      console.error("[dashboard] Error loading /api/dashboard", err);
      if (isRefresh) {
        setRefreshError(dashboardErrorMessage(err, "actualizar"));
      } else {
        setInitialError(dashboardErrorMessage(err, "cargar"));
      }
    } finally {
      if (isRefresh) {
        setIsRefreshing(false);
      } else {
        setIsInitialLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadPanel("initial");
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadPanel]);

  if (isInitialLoading && !data) {
    return <PanelLoadingSkeleton />;
  }

  if (!data && initialError) {
    return (
      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <PageHeader
          title="Panel"
          description="Resumen diario del club para abrir el día con criterio operativo."
        />
        <section className="app-panel-strong rounded-[2rem] p-5">
          <EmptyState message={initialError} className="bg-white/70" />
          <button
            type="button"
            onClick={() => void loadPanel("initial")}
            disabled={isInitialLoading}
            className="app-button-primary mt-4 rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInitialLoading ? "Reintentando..." : "Reintentar"}
          </button>
        </section>
      </main>
    );
  }

  if (!data) {
    return <PanelLoadingSkeleton />;
  }

  const isAdmin = data.role === "ADMIN";
  const quickLinks = isAdmin ? adminQuickLinks : staffQuickLinks;

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <PageHeader
          title="Panel operativo"
          description="Vista reducida para personal con accesos directos y alertas operativas básicas."
        />

        <DashboardStatusBar
          generatedAt={data.generatedAt}
          isRefreshing={isRefreshing}
          refreshError={refreshError}
          onRefresh={() => void loadPanel("refresh")}
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
              Productos por debajo del mínimo configurado.
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
                        Mínimo {product.minStock.toFixed(2)} {product.unit}
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
            <h2 className="text-lg font-black">Últimos accesos</h2>
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
                        {formatAccessType(log.type)}
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
        title="Panel ejecutivo"
        description={`Corte generado ${formatDateTime(data.generatedAt)} con beneficio basado en Sale.profit y costes congelados por venta.`}
      />

      <DashboardStatusBar
        generatedAt={data.generatedAt}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
        onRefresh={() => void loadPanel("refresh")}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
        <StatCard label="Margen medio" value={formatPercent(data.summary.marginPercent)} />
        <StatCard
          label="Descuentos hoy"
          value={formatCurrency(data.summary.discountsTodayTotal)}
        />
      </section>

      {data.summary.marginIsEstimated ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El margen de hoy es estimado porque existen ventas sin coste histórico completo.
        </div>
      ) : null}

      <QuickLinks links={quickLinks} />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="app-panel-strong rounded-[2rem] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Caja del día</h2>
              <p className="mt-1 text-sm app-muted">
                Estado actual del cierre y caja esperada.
              </p>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                data.cash?.dayClosureStatus === "CLOSED"
                  ? "bg-emerald-100 text-emerald-800"
                  : data.cash?.dayClosureStatus === "REOPENED" ||
                      data.cash?.dayClosureStatus === "PENDING"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-sky-100 text-sky-800"
              }`}
            >
              {formatClosureStatus(data.cash?.dayClosureStatus)}
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Stock valorizado</h2>
              <p className="mt-1 text-sm app-muted">
                Valor comercial y coste estimado del stock físico.
              </p>
            </div>
            {data.stockSummary?.stockCostValueEstimated ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                Coste estimado
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Valor stock disponible</div>
              <div className="mt-1 text-3xl font-black">
                {formatCurrency(data.stockSummary?.availableStockValue || 0)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Valor stock reserva</div>
              <div className="mt-1 text-3xl font-black">
                {formatCurrency(data.stockSummary?.reserveStockValue || 0)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Valor del stock físico</div>
              <div className="mt-1 text-3xl font-black">
                {formatCurrency(data.stockSummary?.totalPhysicalStockValue || 0)}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
              <div className="text-sm app-muted">Coste del stock físico</div>
              <div className="mt-1 text-3xl font-black">
                {formatCurrency(data.stockSummary?.stockCostValue || 0)}
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Top productos hoy</h2>
          <p className="mt-1 text-sm app-muted">
            Ranking por revenue y beneficio usando Sale.profit.
          </p>

          <div className="mt-4 space-y-3">
            {!data.topProductsToday || data.topProductsToday.length === 0 ? (
              <EmptyState message="Sin ventas de productos hoy." className="rounded-[1.5rem]" />
            ) : (
              data.topProductsToday.slice(0, 8).map((product) => (
                <div
                  key={product.productId}
                  className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{product.name}</div>
                      <div className="mt-1 text-sm app-muted">
                        {product.salesCount} venta(s) · {formatQty(product.qty, product.unit)}
                      </div>
                    </div>
                    <MarginBadge
                      marginPercent={product.marginPercent}
                      estimated={product.marginIsEstimated}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.18em] app-muted">Revenue</div>
                      <div className="mt-1 font-black">{formatCurrency(product.revenue)}</div>
                    </div>
                    <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.18em] app-muted">
                        Beneficio
                      </div>
                      <div className="mt-1 font-black">{formatCurrency(product.profit)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Top socios hoy</h2>
          <p className="mt-1 text-sm app-muted">
            Acumulado por socio con ingreso final y margen medio.
          </p>

          <div className="mt-4 space-y-3">
            {!data.topMembersToday || data.topMembersToday.length === 0 ? (
              <EmptyState message="Sin ventas por socio hoy." className="rounded-[1.5rem]" />
            ) : (
              data.topMembersToday.slice(0, 8).map((member) => (
                <div
                  key={member.memberId}
                  className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{member.fullName}</div>
                      <div className="mt-1 text-sm app-muted">
                        {member.dni} · {member.salesCount} venta(s) · {formatQty(member.totalQty)}
                      </div>
                    </div>
                    <MarginBadge
                      marginPercent={member.marginPercent}
                      estimated={member.marginIsEstimated}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.18em] app-muted">Revenue</div>
                      <div className="mt-1 font-black">
                        {formatCurrency(member.totalAmount)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.18em] app-muted">
                        Beneficio
                      </div>
                      <div className="mt-1 font-black">{formatCurrency(member.profit)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Finanzas últimos 7 días</h2>
          <p className="mt-1 text-sm app-muted">
            Ingresos y gastos de caja junto al beneficio bruto por ventas.
          </p>

          <div className="mt-4 space-y-2">
            {!data.dailyFinance || data.dailyFinance.length === 0 ? (
              <EmptyState message="Sin datos financieros recientes." className="rounded-[1.5rem]" />
            ) : (
              data.dailyFinance.map((day) => (
                <div
                  key={day.date}
                  className="grid gap-2 rounded-[1.25rem] border border-black/8 bg-white/85 p-3 md:grid-cols-[0.8fr_1fr_1fr_1fr_1fr_auto]"
                >
                  <div>
                    <div className="font-semibold">{day.date}</div>
                    <div className="text-xs app-muted">{day.salesCount} venta(s)</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">Ingresos</div>
                    <div className="font-black">{formatCurrency(day.income)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">Gastos</div>
                    <div className="font-black text-red-700">{formatCurrency(day.expense)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">
                      Beneficio bruto
                    </div>
                    <div className="font-black">{formatCurrency(day.grossProfit)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">Beneficio neto</div>
                    <div
                      className={`font-black ${
                        day.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {formatCurrency(day.netProfit)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="app-panel rounded-[2rem] p-5">
          <h2 className="text-lg font-black">Ventas recientes</h2>
          <p className="mt-1 text-sm app-muted">
            Últimas ventas del día con coste unitario congelado y beneficio.
          </p>

          <div className="mt-4 space-y-2">
            {!data.recentSales || data.recentSales.length === 0 ? (
              <EmptyState message="Sin ventas recientes." className="rounded-[1.5rem]" />
            ) : (
              data.recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="rounded-[1.25rem] border border-black/8 bg-white/85 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {sale.member.fullName} · {sale.product.name}
                      </div>
                      <div className="mt-1 text-sm app-muted">
                        {formatQty(sale.qty, sale.product.unit)} · {formatTime(sale.createdAt)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black">{formatCurrency(sale.finalAmount || 0)}</div>
                      <div className="text-xs app-muted">
                        Original {formatCurrency(sale.originalAmount || sale.totalAmount)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.18em] app-muted">
                        Coste unitario
                      </div>
                      <div className="mt-1 font-black">
                        {formatCurrency(sale.unitCost || 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.18em] app-muted">
                        Descuento
                      </div>
                      <div className="mt-1 font-black">
                        {formatCurrency(sale.discountAmount || 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.18em] app-muted">
                        Beneficio
                      </div>
                      <div className="mt-1 font-black">{formatCurrency(sale.profit || 0)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
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
          <h2 className="text-lg font-black">Últimas acciones</h2>
          <p className="mt-1 text-sm app-muted">
            Últimos eventos de auditoría registrados en el sistema.
          </p>

          <div className="mt-4 space-y-3">
            {data.recentAuditLogs.length === 0 ? (
              <EmptyState
                message="Sin eventos recientes de auditoría."
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
                        {log.actorUser?.name || log.actorEmail || "Sistema"} · {log.entityType}
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
                  <div className="mt-2 text-xs app-muted">{formatDateTime(log.createdAt)}</div>
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
              <div className="text-sm app-muted">Socios con entrada hoy</div>
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
                      {formatAccessType(log.type)}
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
            Prioridades de reposición o ajuste de inventario.
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
                      Mínimo {product.minStock.toFixed(2)} {product.unit}
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
