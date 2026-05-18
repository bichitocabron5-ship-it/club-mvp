"use client";

import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import type { DashboardData } from "@/lib/types";
import { useEffect, useState } from "react";

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
          description="Resumen operativo del club en tiempo real."
        />
        <EmptyState message={error} />
      </main>
    );
  }

  if (!data) {
    return <main className="p-6 app-muted">Cargando dashboard...</main>;
  }

  const hasAlerts =
    data.alerts.membersWithoutContract > 0 ||
    data.alerts.expiredMembers > 0 ||
    data.alerts.blockedMembers > 0 ||
    data.alerts.lowStock > 0;

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Dashboard"
        description="Resumen operativo del club en tiempo real."
      />

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Ingresos hoy"
          value={`${Number(data.income).toFixed(2)} EUR`}
        />
        <StatCard
          label="Balance hoy"
          value={`${Number(data.balance).toFixed(2)} EUR`}
        />
        <StatCard label="Retiradas" value={data.salesCount} />
        <StatCard label="Socios hoy" value={data.activeMembersToday} />
        <StatCard
          label="Aforo actual"
          value={data.currentInsideCount}
          className="bg-gray-900 text-white"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Top ventas</h2>
          <div className="space-y-2">
            {data.topProductsByRevenue.map((p) => (
              <div key={p.productId} className="rounded border p-3">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm text-gray-500">
                  {p.qty.toFixed(2)} {p.unit}
                </div>
                <div className="mt-1 font-bold text-green-700">
                  {p.revenue.toFixed(2)} EUR
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Más rentables</h2>
          <div className="space-y-2">
            {data.topProductsByProfit.map((p) => (
              <div key={p.productId} className="rounded border p-3">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm text-gray-500">{p.salesCount} ventas</div>
                <div className="mt-1 font-bold text-purple-700">
                  +{p.profit.toFixed(2)} EUR
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Menor margen</h2>
          <div className="space-y-2">
            {data.worstProductsByProfit.map((p) => (
              <div key={p.productId} className="rounded border p-3">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm text-gray-500">{p.salesCount} ventas</div>
                <div className="mt-1 font-bold text-red-600">
                  {p.profit.toFixed(2)} EUR
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Ingresos"
          value={`${Number(data.income).toFixed(2)} EUR`}
          className="bg-green-50"
          valueClassName="text-3xl font-black text-green-800"
        />
        <StatCard
          label="Gastos"
          value={`${Number(data.expense).toFixed(2)} EUR`}
          className="bg-red-50"
          valueClassName="text-3xl font-black text-red-800"
        />
        <StatCard
          label="Margen bruto"
          value={`${Number(data.grossProfit).toFixed(2)} EUR`}
          className="bg-purple-50"
          valueClassName="text-3xl font-black text-purple-800"
        />
        <StatCard
          label="Deuda proveedores"
          value={`${Number(data.supplierDebt).toFixed(2)} EUR`}
          className="bg-yellow-50"
        />
        <StatCard
          label="Beneficio neto estimado"
          value={`${Number(data.netProfit).toFixed(2)} EUR`}
          className={data.netProfit >= 0 ? "bg-green-50" : "bg-red-50"}
          valueClassName={
            data.netProfit >= 0
              ? "text-3xl font-black text-green-800"
              : "text-3xl font-black text-red-800"
          }
        />
        <StatCard
          label="Resultado neto"
          value={`${Number(data.balance).toFixed(2)} EUR`}
          className={data.balance >= 0 ? "bg-blue-50" : "bg-red-50"}
          valueClassName={
            data.balance >= 0
              ? "text-3xl font-black text-blue-800"
              : "text-3xl font-black text-red-800"
          }
        />
      </section>

      <section className="app-panel rounded-3xl p-4 md:p-5">
        <h2 className="mb-3 text-lg font-bold">Finanzas últimos 7 días</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Día</th>
                <th className="p-2 text-right">Ingresos</th>
                <th className="p-2 text-right">Gastos</th>
                <th className="p-2 text-right">Margen</th>
                <th className="p-2 text-right">Neto</th>
                <th className="p-2 text-right">Retiradas</th>
              </tr>
            </thead>

            <tbody>
              {data.dailyFinance.map((day) => (
                <tr key={day.date} className="border-b">
                  <td className="p-2">{new Date(day.date).toLocaleDateString()}</td>
                  <td className="p-2 text-right text-green-700">
                    {Number(day.income).toFixed(2)} EUR
                  </td>
                  <td className="p-2 text-right text-red-600">
                    -{Number(day.expense).toFixed(2)} EUR
                  </td>
                  <td className="p-2 text-right text-purple-700">
                    {Number(day.grossProfit).toFixed(2)} EUR
                  </td>
                  <td
                    className={
                      day.netProfit >= 0
                        ? "p-2 text-right font-bold text-green-700"
                        : "p-2 text-right font-bold text-red-700"
                    }
                  >
                    {Number(day.netProfit).toFixed(2)} EUR
                  </td>
                  <td className="p-2 text-right">{day.salesCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {hasAlerts && (
        <section className="mb-6 rounded-3xl border border-red-200 bg-red-50/95 p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold text-red-800">
            Alertas operativas
          </h2>

          <div className="grid gap-2 md:grid-cols-4">
            <div className="rounded bg-white p-3">
              <div className="text-sm text-gray-500">Sin contrato</div>
              <strong className="text-red-700">
                {data.alerts.membersWithoutContract}
              </strong>
            </div>
            <div className="rounded bg-white p-3">
              <div className="text-sm text-gray-500">Caducados</div>
              <strong className="text-red-700">{data.alerts.expiredMembers}</strong>
            </div>
            <div className="rounded bg-white p-3">
              <div className="text-sm text-gray-500">Bloqueados</div>
              <strong className="text-red-700">{data.alerts.blockedMembers}</strong>
            </div>
            <div className="rounded bg-white p-3">
              <div className="text-sm text-gray-500">Stock bajo</div>
              <strong className="text-red-700">{data.alerts.lowStock}</strong>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Últimas retiradas</h2>
          {data.lastSales.length === 0 && (
            <EmptyState message="Sin retiradas hoy." />
          )}
          <div className="space-y-2">
            {data.lastSales.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between rounded border p-3"
              >
                <div>
                  <div className="font-semibold">{sale.member.fullName}</div>
                  <div className="text-sm text-gray-500">
                    {sale.product.name} · {sale.qty} {sale.product.unit}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(sale.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <strong>{Number(sale.totalAmount).toFixed(2)} EUR</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Top socios hoy</h2>
          {data.topMembersByAmount.length === 0 && (
            <EmptyState message="Sin actividad de socios hoy." />
          )}
          <div className="space-y-2">
            {data.topMembersByAmount.map((member) => (
              <div key={member.memberId} className="rounded border p-3">
                <div className="font-semibold">{member.fullName}</div>
                <div className="text-sm text-gray-500">{member.dni}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    Retiradas: <strong>{member.salesCount}</strong>
                  </div>
                  <div>
                    Total: <strong>{member.totalAmount.toFixed(2)} EUR</strong>
                  </div>
                  <div>
                    Margen:{" "}
                    <strong className="text-purple-700">
                      {member.profit.toFixed(2)} EUR
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Últimos accesos</h2>
          {data.lastAccessLogs.length === 0 && (
            <EmptyState message="Sin accesos registrados." />
          )}
          <div className="space-y-2">
            {data.lastAccessLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded border p-3"
              >
                <div>
                  <div className="font-semibold">{log.member.fullName}</div>
                  <div className="text-sm text-gray-500">{log.member.dni}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <span
                  className={
                    log.type === "IN"
                      ? "rounded bg-green-100 px-3 py-1 text-green-700"
                      : "rounded bg-blue-100 px-3 py-1 text-blue-700"
                  }
                >
                  {log.type === "IN" ? "Entrada" : "Salida"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Gastos por categoría</h2>
          {Object.keys(data.expensesByCategory).length === 0 && (
            <EmptyState message="Sin gastos hoy." />
          )}
          <div className="space-y-2">
            {Object.entries(data.expensesByCategory).map(([category, amount]) => (
              <div
                key={category}
                className="flex items-center justify-between rounded border p-3"
              >
                <div className="font-semibold">{category}</div>
                <strong className="text-red-600">
                  -{Number(amount).toFixed(2)} EUR
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Compras pendientes</h2>
          {data.pendingPurchases.length === 0 && (
            <EmptyState message="No hay deuda pendiente." />
          )}
          <div className="space-y-2">
            {data.pendingPurchases.map((purchase) => (
              <div key={purchase.id} className="rounded border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{purchase.supplierName}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(purchase.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="rounded bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-700">
                    {purchase.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    Total: <strong>{purchase.totalAmount.toFixed(2)} EUR</strong>
                  </div>
                  <div>
                    Pagado: <strong>{purchase.paidAmount.toFixed(2)} EUR</strong>
                  </div>
                  <div>
                    Pendiente:{" "}
                    <strong className="text-red-600">
                      {purchase.pendingAmount.toFixed(2)} EUR
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Últimos cierres</h2>
          {data.recentClosures.length === 0 && (
            <EmptyState message="No hay cierres registrados." />
          )}
          <div className="space-y-2">
            {data.recentClosures.map((closure) => (
              <div key={closure.id} className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{closure.day}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(closure.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <strong
                    className={
                      Number(closure.difference) === 0
                        ? "text-green-700"
                        : "text-red-700"
                    }
                  >
                    {Number(closure.difference).toFixed(2)} EUR
                  </strong>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    Esperado:{" "}
                    <strong>{Number(closure.expectedCash).toFixed(2)} EUR</strong>
                  </div>
                  <div>
                    Contado:{" "}
                    <strong>{Number(closure.countedCash).toFixed(2)} EUR</strong>
                  </div>
                  <div>
                    Balance:{" "}
                    <strong>{Number(closure.balance).toFixed(2)} EUR</strong>
                  </div>
                </div>
                {closure.note && (
                  <div className="mt-2 rounded bg-gray-50 p-2 text-sm text-gray-600">
                    {closure.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Últimos gastos</h2>
          {data.expensesToday.length === 0 && (
            <EmptyState message="Sin gastos registrados hoy." />
          )}
          <div className="space-y-2">
            {data.expensesToday.slice(0, 8).map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between rounded border p-3"
              >
                <div>
                  <div className="font-semibold">{expense.description}</div>
                  <div className="text-sm text-gray-500">
                    {expense.category} · {expense.paidMethod}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(expense.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <strong className="text-red-600">
                  -{Number(expense.amount).toFixed(2)} EUR
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-3xl p-4 md:p-5 xl:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Stock bajo</h2>
          {data.lowStock.length === 0 && (
            <EmptyState message="Sin alertas de stock." />
          )}
          <div className="grid gap-2 md:grid-cols-2">
            {data.lowStock.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between rounded border p-3"
              >
                <div>
                  <div className="font-semibold">{product.name}</div>
                  <div className="text-sm text-gray-500">
                    Mínimo: {Number(product.minStock).toFixed(2)} {product.unit}
                  </div>
                </div>
                <strong className="text-red-600">
                  {Number(product.stock).toFixed(2)} {product.unit}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
