// app/page.tsx
"use client";

import { useEffect, useState } from "react";

type LowStockProduct = {
  id: number;
  name: string;
  stock: number;
  minStock: number;
  unit: string;
};

type DashboardSale = {
  id: number;
  qty: number;
  totalAmount: number;
  createdAt: string;
  member: {
    fullName: string;
  };
  product: {
    name: string;
    unit: string;
  };
};

type DashboardAccessLog = {
  id: number;
  type: "IN" | "OUT" | string;
  createdAt: string;
  member: {
    fullName: string;
    dni: string;
  };
};

type DashboardData = {
  income: number;
  expense: number;
  balance: number;
  salesCount: number;
  grossProfit: number;
  netProfit: number;
  activeMembersToday: number;
  currentInsideCount: number;
  lowStock: LowStockProduct[];
  lastSales: DashboardSale[];
  lastAccessLogs: DashboardAccessLog[];
  expensesToday: DashboardExpense[];
  expensesByCategory: Record<string, number>;
  topProductsByRevenue: ProductStat[];
  topProductsByProfit: ProductStat[];
  worstProductsByProfit: ProductStat[];
  topMembersByAmount: MemberStat[];
  dailyFinance: DailyFinance[];
  supplierDebt: number;
  endingPurchases: PendingPurchase[];
  alerts: {
    membersWithoutContract: number;
    expiredMembers: number;
    blockedMembers: number;
    lowStock: number;
  };
};

type DashboardExpense = {
  id: number;
  category: string;
  description: string;
  amount: number;
  paidMethod: string;
  createdAt: string;
};

type ProductStat = {
  productId: number;
  name: string;
  unit: string;
  qty: number;
  revenue: number;
  profit: number;
  salesCount: number;
};

type MemberStat = {
  memberId: number;
  fullName: string;
  dni: string;
  salesCount: number;
  totalAmount: number;
  totalQty: number;
  profit: number;
};

type DailyFinance = {
  date: string;
  income: number;
  expense: number;
  grossProfit: number;
  netProfit: number;
  salesCount: number;
};

type PendingPurchase = {
  id: number;
  supplierName: string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: string;
  createdAt: string;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  
  async function loadDashboard() {
    const res = await fetch("/api/dashboard");
    const json: DashboardData = await res.json();
    
    setData(json);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadDashboard();
      
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  if (!data) {
    return <main className="p-6">Cargando dashboard...</main>;
  }

  const hasAlerts =
    data.alerts.membersWithoutContract > 0 ||
    data.alerts.expiredMembers > 0 ||
    data.alerts.blockedMembers > 0 ||
    data.alerts.lowStock > 0;

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Resumen operativo del club en tiempo real.
        </p>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-5">
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Ingresos hoy</div>
          <div className="text-2xl font-black">
            {Number(data.income).toFixed(2)} €
          </div>
        </div>

        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Balance hoy</div>
          <div className="text-2xl font-black">
            {Number(data.balance).toFixed(2)} €
          </div>
        </div>

        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Retiradas</div>
          <div className="text-2xl font-black">{data.salesCount}</div>
        </div>

        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Socios hoy</div>
          <div className="text-2xl font-black">{data.activeMembersToday}</div>
        </div>

        <div className="rounded border bg-gray-900 p-4 text-white">
          <div className="text-sm opacity-80">Aforo actual</div>
          <div className="text-2xl font-black">{data.currentInsideCount}</div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">
            Top ventas
          </h2>

          <div className="space-y-2">
            {data.topProductsByRevenue.map((p) => (
              <div
                key={p.productId}
                className="rounded border p-3"
              >
                <div className="font-semibold">{p.name}</div>

                <div className="text-sm text-gray-500">
                  {p.qty.toFixed(2)} {p.unit}
                </div>

                <div className="mt-1 text-green-700 font-bold">
                  {p.revenue.toFixed(2)} €
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">
            Más rentables
          </h2>

          <div className="space-y-2">
            {data.topProductsByProfit.map((p) => (
              <div
                key={p.productId}
                className="rounded border p-3"
              >
                <div className="font-semibold">{p.name}</div>

                <div className="text-sm text-gray-500">
                  {p.salesCount} ventas
                </div>

                <div className="mt-1 font-bold text-purple-700">
                  +{p.profit.toFixed(2)} €
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">
            Menor margen
          </h2>

          <div className="space-y-2">
            {data.worstProductsByProfit.map((p) => (
              <div
                key={p.productId}
                className="rounded border p-3"
              >
                <div className="font-semibold">{p.name}</div>

                <div className="text-sm text-gray-500">
                  {p.salesCount} ventas
                </div>

                <div className="mt-1 font-bold text-red-600">
                  {p.profit.toFixed(2)} €
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-6">
        <div className="rounded border bg-green-50 p-4">
          <div className="text-sm text-green-700">Ingresos</div>
          <div className="text-3xl font-black text-green-800">
            {Number(data.income).toFixed(2)} €
          </div>
        </div>

        <div className="rounded border bg-red-50 p-4">
          <div className="text-sm text-red-700">Gastos</div>
          <div className="text-3xl font-black text-red-800">
            {Number(data.expense).toFixed(2)} €
          </div>
        </div>

        <div className="rounded border bg-purple-50 p-4">
          <div className="text-sm text-purple-700">Margen bruto</div>
          <div className="text-3xl font-black text-purple-800">
            {Number(data.grossProfit).toFixed(2)} €
          </div>
        </div>

        <div className="rounded border bg-yellow-50 p-4">
          <div className="text-sm text-yellow-700">Deuda proveedores</div>
          <div className="text-2xl font-black text-yellow-800">
            {Number(data.supplierDebt).toFixed(2)} €
          </div>
        </div>

        <div
          className={
            data.netProfit >= 0
              ? "rounded border bg-green-50 p-4"
              : "rounded border bg-red-50 p-4"
          }
        >
          <div className="text-sm text-gray-600">Beneficio neto estimado</div>
          <div
            className={
              data.netProfit >= 0
                ? "text-3xl font-black text-green-800"
                : "text-3xl font-black text-red-800"
            }
          >
            {Number(data.netProfit).toFixed(2)} €
          </div>
        </div>

        <div
          className={
            data.balance >= 0
              ? "rounded border bg-blue-50 p-4"
              : "rounded border bg-red-50 p-4"
          }
        >
          <div className="text-sm text-gray-600">Resultado neto</div>
          <div
            className={
              data.balance >= 0
                ? "text-3xl font-black text-blue-800"
                : "text-3xl font-black text-red-800"
            }
          >
            {Number(data.balance).toFixed(2)} €
          </div>
        </div>
      </section>

        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Finanzas últimos 7 días</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                    <td className="p-2">
                      {new Date(day.date).toLocaleDateString()}
                    </td>

                    <td className="p-2 text-right text-green-700">
                      {Number(day.income).toFixed(2)} €
                    </td>

                    <td className="p-2 text-right text-red-600">
                      -{Number(day.expense).toFixed(2)} €
                    </td>

                    <td className="p-2 text-right text-purple-700">
                      {Number(day.grossProfit).toFixed(2)} €
                    </td>

                    <td
                      className={
                        day.netProfit >= 0
                          ? "p-2 text-right font-bold text-green-700"
                          : "p-2 text-right font-bold text-red-700"
                      }
                    >
                      {Number(day.netProfit).toFixed(2)} €
                    </td>

                    <td className="p-2 text-right">
                      {day.salesCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      {hasAlerts && (
        <section className="mb-6 rounded border border-red-300 bg-red-50 p-4">
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
              <strong className="text-red-700">
                {data.alerts.expiredMembers}
              </strong>
            </div>

            <div className="rounded bg-white p-3">
              <div className="text-sm text-gray-500">Bloqueados</div>
              <strong className="text-red-700">
                {data.alerts.blockedMembers}
              </strong>
            </div>

            <div className="rounded bg-white p-3">
              <div className="text-sm text-gray-500">Stock bajo</div>
              <strong className="text-red-700">{data.alerts.lowStock}</strong>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Últimas retiradas</h2>

          {data.lastSales.length === 0 && (
            <p className="text-sm text-gray-500">Sin retiradas hoy.</p>
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

                <strong>{Number(sale.totalAmount).toFixed(2)} €</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Top socios hoy</h2>

          {data.topMembersByAmount.length === 0 && (
            <p className="text-sm text-gray-500">Sin actividad de socios hoy.</p>
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
                    Total: <strong>{member.totalAmount.toFixed(2)} €</strong>
                  </div>
                  <div>
                    Margen:{" "}
                    <strong className="text-purple-700">
                      {member.profit.toFixed(2)} €
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Últimos accesos</h2>

          {data.lastAccessLogs.length === 0 && (
            <p className="text-sm text-gray-500">Sin accesos registrados.</p>
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

        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Gastos por categoría</h2>

          {Object.keys(data.expensesByCategory).length === 0 && (
            <p className="text-sm text-gray-500">Sin gastos hoy.</p>
          )}

          <div className="space-y-2">
            {Object.entries(data.expensesByCategory).map(([category, amount]) => (
              <div
                key={category}
                className="flex items-center justify-between rounded border p-3"
              >
                <div className="font-semibold">{category}</div>
                <strong className="text-red-600">
                  -{Number(amount).toFixed(2)} €
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Compras pendientes</h2>

          {data.endingPurchases.length === 0 && (
            <p className="text-sm text-gray-500">No hay deuda pendiente.</p>
          )}

          <div className="space-y-2">
            {data.endingPurchases.map((purchase) => (
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
                    Total: <strong>{purchase.totalAmount.toFixed(2)} €</strong>
                  </div>
                  <div>
                    Pagado: <strong>{purchase.paidAmount.toFixed(2)} €</strong>
                  </div>
                  <div>
                    Pendiente:{" "}
                    <strong className="text-red-600">
                      {purchase.pendingAmount.toFixed(2)} €
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Últimos gastos</h2>

          {data.expensesToday.length === 0 && (
            <p className="text-sm text-gray-500">Sin gastos registrados hoy.</p>
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
                  -{Number(expense.amount).toFixed(2)} €
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Stock bajo</h2>

          {data.lowStock.length === 0 && (
            <p className="text-sm text-gray-500">Sin alertas de stock.</p>
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