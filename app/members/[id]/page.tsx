// app/members/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function MemberDetail() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/members/${id}/history`)
      .then((res) => res.json())
      .then(setData);
  }, [id]);

  if (!data) return <div>Cargando...</div>;

  return (
    <main>
      <h1 className="text-xl font-bold mb-4">Historial del socio</h1>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="border p-3 rounded">
          <div className="text-sm text-gray-500">Retiradas</div>
          <strong>{data.count}</strong>
        </div>

        <div className="border p-3 rounded">
          <div className="text-sm text-gray-500">Total</div>
          <strong>{Number(data.totalSpent).toFixed(2)} €</strong>
        </div>
      </div>

      <div className="space-y-2">
        {data.sales.map((s: any) => (
          <div key={s.id} className="border p-3 rounded flex justify-between">
            <div>
              <div>{s.product.name}</div>
              <div className="text-sm text-gray-500">
                {s.qty} {s.product.unit}
              </div>
            </div>

            <div className="text-right">
              <div className="font-semibold">
                {Number(s.totalAmount).toFixed(2)} €
              </div>
              <div className="text-xs text-gray-500">
                {new Date(s.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}