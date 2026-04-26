// app/page.tsx
"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) {
    return <main>Cargando...</main>;
  }

  return (
    <main>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Ingresos hoy</div>
          <strong>{Number(data.income).toFixed(2)} €</strong>
        </div>

        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Balance hoy</div>
          <strong>{Number(data.balance).toFixed(2)} €</strong>
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
        <h2 className="font-semibold mb-2">Últimas retiradas</h2>

        <div className="space-y-2">
          {data.lastSales.length === 0 && (
            <div className="text-sm text-gray-500">Sin retiradas hoy.</div>
          )}

          {data.lastSales.map((s: any) => (
            <div key={s.id} className="rounded border p-3 flex justify-between">
              <div>
                <div className="font-medium">{s.member.fullName}</div>
                <div className="text-sm text-gray-500">
                  {s.product.name} · {s.qty} {s.product.unit}
                </div>
              </div>

              <strong>{Number(s.totalAmount).toFixed(2)} €</strong>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Stock bajo</h2>

        <div className="space-y-2">
          {data.lowStock.length === 0 && (
            <div className="text-sm text-gray-500">Sin alertas de stock.</div>
          )}

          {data.lowStock.map((p: any) => (
            <div key={p.id} className="rounded border p-3 flex justify-between">
              <span>{p.name}</span>
              <strong className="text-red-600">
                {p.stock} {p.unit}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}