"use client";

import Link from "next/link";
import { use, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import type { InventoryCountDetail } from "@/lib/types";

function countTypeLabel(type: string) {
  if (type === "PARTIAL") return "Parcial";
  if (type === "FULL") return "Completo";
  if (type === "CLOSING") return "Cierre";
  if (type === "AUDIT") return "Auditoria";
  return type;
}

function countStatusLabel(status: string) {
  if (status === "OPEN") return "Abierto";
  if (status === "CONFIRMED") return "Confirmado";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

function differenceClass(value: number | null) {
  if (value === null || value === 0) return "text-gray-700";
  return value > 0 ? "text-green-700" : "text-red-700";
}

export default function InventoryCountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [count, setCount] = useState<InventoryCountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<
    Record<number, { countedQty: string; note: string }>
  >({});

  const loadCount = useEffectEvent(async () => {
    setLoading(true);

    try {
      const data = await fetchJson<InventoryCountDetail>(`/api/inventory-counts/${id}`);
      setCount(data);
      setDrafts(
        Object.fromEntries(
          data.items.map((item) => [
            item.id,
            {
              countedQty: item.countedQty === null ? "" : String(item.countedQty),
              note: item.note ?? "",
            },
          ])
        )
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando conteo");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCount();
    }, 0);

    return () => clearTimeout(timeout);
  }, [id]);

  const computedSummary = useMemo(() => {
    if (!count) {
      return null;
    }

    return count.items.reduce(
      (acc, item) => {
        const rawQty = drafts[item.id]?.countedQty ?? "";
        const countedQty = rawQty === "" ? null : Number(rawQty);
        const differenceQty =
          countedQty === null ? null : countedQty - Number(item.expectedQty);

        acc.totalItems += 1;

        if (countedQty !== null) {
          acc.countedItems += 1;
        }

        if (differenceQty !== null && differenceQty !== 0) {
          acc.differenceItems += 1;
        }

        return acc;
      },
      {
        totalItems: 0,
        countedItems: 0,
        differenceItems: 0,
      }
    );
  }, [count, drafts]);

  async function handleSave() {
    if (!count) {
      return;
    }

    setSaving(true);

    try {
      const updated = await fetchJson<InventoryCountDetail>(`/api/inventory-counts/${count.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: count.items.map((item) => {
            const countedValue = drafts[item.id]?.countedQty ?? "";

            return {
              id: item.id,
              countedQty: countedValue === "" ? null : Number(countedValue),
              note: drafts[item.id]?.note ?? "",
            };
          }),
        }),
      });

      setCount(updated);
      setDrafts(
        Object.fromEntries(
          updated.items.map((item) => [
            item.id,
            {
              countedQty: item.countedQty === null ? "" : String(item.countedQty),
              note: item.note ?? "",
            },
          ])
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error guardando conteo");
    } finally {
      setSaving(false);
    }
  }

  async function handleProcess(action: "confirm" | "cancel") {
    if (!count) {
      return;
    }

    const confirmed =
      action === "confirm"
        ? window.confirm("La confirmacion es irreversible. Continuar?")
        : window.confirm("Cancelar este conteo?");

    if (!confirmed) {
      return;
    }

    setProcessing(true);

    try {
      const updated = await fetchJson<InventoryCountDetail>(
        `/api/inventory-counts/${count.id}/${action}`,
        {
          method: "POST",
        }
      );

      setCount(updated);
      setDrafts(
        Object.fromEntries(
          updated.items.map((item) => [
            item.id,
            {
              countedQty: item.countedQty === null ? "" : String(item.countedQty),
              note: item.note ?? "",
            },
          ])
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : `Error en ${action}`);
    } finally {
      setProcessing(false);
    }
  }

  const canEdit = count?.status === "OPEN";

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title={count ? `Conteo #${count.id}` : "Detalle de conteo"}
        description="Compara stock del sistema con stock contado y genera ajustes auditados al confirmar."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Link
          href="/stock/counts"
          className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 font-semibold"
        >
          Volver a conteos
        </Link>

        {canEdit && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || processing}
            className="inline-flex rounded-full bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Guardando..." : "Guardar avances"}
          </button>
        )}

        {isAdmin && canEdit && (
          <button
            type="button"
            onClick={() => void handleProcess("confirm")}
            disabled={saving || processing}
            className="inline-flex rounded-full bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-40"
          >
            Confirmar conteo
          </button>
        )}

        {isAdmin && canEdit && (
          <button
            type="button"
            onClick={() => void handleProcess("cancel")}
            disabled={saving || processing}
            className="inline-flex rounded-full bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-40"
          >
            Cancelar conteo
          </button>
        )}
      </div>

      {error && <EmptyState message={error} className="mb-4" />}

      {loading && <EmptyState message="Cargando conteo..." />}

      {count && computedSummary && (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="app-panel rounded-3xl p-4">
              <div className="text-sm text-gray-500">Estado</div>
              <div className="mt-1 text-lg font-bold">{countStatusLabel(count.status)}</div>
            </div>
            <div className="app-panel rounded-3xl p-4">
              <div className="text-sm text-gray-500">Tipo</div>
              <div className="mt-1 text-lg font-bold">{countTypeLabel(count.type)}</div>
            </div>
            <div className="app-panel rounded-3xl p-4">
              <div className="text-sm text-gray-500">Lineas</div>
              <div className="mt-1 text-lg font-bold">{computedSummary.totalItems}</div>
            </div>
            <div className="app-panel rounded-3xl p-4">
              <div className="text-sm text-gray-500">Contadas</div>
              <div className="mt-1 text-lg font-bold">{computedSummary.countedItems}</div>
            </div>
            <div className="app-panel rounded-3xl p-4">
              <div className="text-sm text-gray-500">Con diferencia</div>
              <div className="mt-1 text-lg font-bold">{computedSummary.differenceItems}</div>
            </div>
          </section>

          {count.notes && (
            <section className="app-panel rounded-3xl p-4 md:p-5">
              <h2 className="mb-2 text-lg font-bold">Notas</h2>
              <p className="text-sm leading-6 text-gray-600">{count.notes}</p>
            </section>
          )}

          <section className="app-panel rounded-3xl p-4 md:p-5">
            <h2 className="mb-4 text-lg font-bold">Lineas del conteo</h2>

            <div className="space-y-3">
              {count.items.map((item) => {
                const draft = drafts[item.id] ?? { countedQty: "", note: "" };
                const countedQty =
                  draft.countedQty === "" ? null : Number(draft.countedQty);
                const differenceQty =
                  countedQty === null ? null : countedQty - Number(item.expectedQty);

                return (
                  <div
                    key={item.id}
                    className="rounded-3xl border border-black/8 bg-white/72 p-4"
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
                      <div>
                        <div className="text-lg font-bold">{item.product.name}</div>
                        <div className="text-sm text-gray-500">
                          Sistema al abrir conteo: {Number(item.expectedQty).toFixed(2)} {item.product.unit}
                        </div>
                        <div className="text-sm text-gray-500">
                          Stock actual: {Number(item.product.stock).toFixed(2)} {item.product.unit}
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">
                          Stock contado
                        </label>
                        <input
                          className="w-full rounded-2xl border border-black/10 bg-white/90 p-3"
                          type="number"
                          min="0"
                          step={item.product.unit === "UD" ? "1" : "0.01"}
                          value={draft.countedQty}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [item.id]: {
                                ...current[item.id],
                                countedQty: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-semibold">Diferencia</div>
                        <div className={`text-lg font-bold ${differenceClass(differenceQty)}`}>
                          {differenceQty === null
                            ? "Pendiente"
                            : `${differenceQty.toFixed(2)} ${item.product.unit}`}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Nota de linea</label>
                      <input
                        className="w-full rounded-2xl border border-black/10 bg-white/90 p-3"
                        value={draft.note}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              note: e.target.value,
                            },
                          }))
                        }
                        placeholder="Observaciones del conteo"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
