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
  activeMembersToday: number;
  currentInsideCount: number;
  lowStock: LowStockProduct[];
  lastSales: DashboardSale[];
  lastAccessLogs: DashboardAccessLog[];
  alerts: {
    membersWithoutContract: number;
    expiredMembers: number;
    blockedMembers: number;
    lowStock: number;
  };
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