"use client";

import type { DashboardData } from "@/lib/types";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/dashboard")
      .then((res) => res.json())
      .then((nextData: DashboardData) => {
        if (!cancelled) {
          setData(nextData);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return <main>Cargando...</main>;
  }

  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Ingresos hoy</div>
          <strong>{Number(data.income).toFixed(2)} EUR</strong>
        </div>

        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Balance hoy</div>
          <strong>{Number(data.balance).toFixed(2)} EUR</strong>
        </div>

        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Retiradas hoy</div>
          <strong>{data.salesCount}</strong>
        </div>

        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Socios hoy</div>
          <strong>{data.activeMembersToday}</strong>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Ultimas retiradas</h2>

        <div className="space-y-2">
          {data.lastSales.length === 0 && (
            <div className="text-sm text-gray-500">Sin retiradas hoy.</div>
          )}

          {data.lastSales.map((sale) => (
            <div key={sale.id} className="flex justify-between rounded border p-3">
              <div>
                <div className="font-medium">{sale.member.fullName}</div>
                <div className="text-sm text-gray-500">
                  {sale.product.name} · {sale.qty} {sale.product.unit}
                </div>
              </div>

              <strong>{Number(sale.totalAmount).toFixed(2)} EUR</strong>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Stock bajo</h2>

        <div className="space-y-2">
          {data.lowStock.length === 0 && (
            <div className="text-sm text-gray-500">Sin alertas de stock.</div>
          )}

          {data.lowStock.map((product) => (
            <div
              key={product.id}
              className="flex justify-between rounded border p-3"
            >
              <span>{product.name}</span>
              <strong className="text-red-600">
                {product.stock} {product.unit}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
