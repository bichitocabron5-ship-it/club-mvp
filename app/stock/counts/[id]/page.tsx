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
  if (type === "AUDIT") return "Auditoría";
  return type;
}

function countStatusLabel(status: string) {
  if (status === "OPEN") return "Abierto";
  if (status === "CONFIRMED") return "Confirmado";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

function differenceClass(value: number | null) {
  if (value === null) return "text-amber-800";
  if (value === 0) return "text-emerald-700";
  return value > 0 ? "text-emerald-700" : "text-red-700";
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
    setError("");

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
      setError(err instanceof Error ? err.message : "Error guardando conteo");
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
        ? window.confirm("La confirmación es irreversible. ¿Continuar?")
        : window.confirm("¿Cancelar este conteo?");

    if (!confirmed) {
      return;
    }

    setProcessing(true);
    setError("");

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
      setError(
        err instanceof Error
          ? err.message
          : action === "confirm"
            ? "Error confirmando conteo"
            : "Error cancelando conteo"
      );
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

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Link
          href="/stock/counts"
          className="app-button-secondary inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold xl:w-auto"
        >
          ← Volver a conteos
        </Link>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canEdit && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || processing}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#0b0b0c] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#171719] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {saving ? "Guardando..." : "Guardar avances"}
            </button>
          )}

          {isAdmin && canEdit && (
            <button
              type="button"
              onClick={() => void handleProcess("confirm")}
              disabled={saving || processing}
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {processing ? "Procesando..." : "Confirmar conteo"}
            </button>
          )}

          {isAdmin && canEdit && (
            <button
              type="button"
              onClick={() => void handleProcess("cancel")}
              disabled={saving || processing}
              className="app-button-danger inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Cancelar conteo
            </button>
          )}
        </div>
      </div>

      {error && <EmptyState message={error} className="mb-4" />}

      {loading && <EmptyState message="Cargando conteo..." />}

      {count && computedSummary && (
        <div className="space-y-4">
          <section className="app-panel-strong overflow-hidden rounded-[2rem]">
            <div className="border-b border-black/7 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                    <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                      Control de inventario
                    </span>
                  </div>

                  <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                    Resumen del conteo
                  </h2>

                  <p className="mt-1 text-sm app-muted">
                    Estado actual y progreso del recuento físico.
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                    count.status === "OPEN"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : count.status === "CONFIRMED"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-black/10 bg-black/5 text-[#6d6860]"
                  }`}
                >
                  {countStatusLabel(count.status)}
                </span>
              </div>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-5">
              <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-[#b4a78d]" />
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                  Tipo
                </div>
                <div className="mt-3 text-xl font-black text-[#201f1d]">
                  {countTypeLabel(count.type)}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-[#0b0b0c]" />
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                  Líneas
                </div>
                <div className="mt-3 text-2xl font-black text-[#201f1d]">
                  {computedSummary.totalItems}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-4">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" />
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-emerald-700/75">
                  Contadas
                </div>
                <div className="mt-3 text-2xl font-black text-emerald-700">
                  {computedSummary.countedItems}
                </div>
              </div>

              <div
                className={`relative overflow-hidden rounded-[1.5rem] border p-4 ${
                  computedSummary.differenceItems > 0
                    ? "border-red-100 bg-red-50/70"
                    : "border-emerald-100 bg-emerald-50/70"
                }`}
              >
                <div
                  className={`absolute inset-x-0 top-0 h-[3px] ${
                    computedSummary.differenceItems > 0
                      ? "bg-red-500"
                      : "bg-emerald-500"
                  }`}
                />
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                  Con diferencia
                </div>
                <div
                  className={`mt-3 text-2xl font-black ${
                    computedSummary.differenceItems > 0
                      ? "text-red-700"
                      : "text-emerald-700"
                  }`}
                >
                  {computedSummary.differenceItems}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[1.5rem] border border-amber-200 bg-amber-50/70 p-4">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-amber-500" />
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                  Pendientes
                </div>
                <div className="mt-3 text-2xl font-black text-amber-800">
                  {computedSummary.totalItems - computedSummary.countedItems}
                </div>
              </div>
            </div>
          </section>

          {count.notes && (
            <section className="app-panel overflow-hidden rounded-[2rem]">
              <div className="border-b border-black/7 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-[2px] w-5 rounded-full bg-[#b4a78d]" />

                  <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                    Observaciones
                  </span>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <p className="whitespace-pre-wrap text-sm leading-6 text-[#201f1d]">
                  {count.notes}
                </p>
              </div>
            </section>
          )}

          <section className="app-panel overflow-hidden rounded-[2rem]">
            <div className="border-b border-black/7 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                    <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                      Recuento físico
                    </span>
                  </div>

                  <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                    Líneas del conteo
                  </h2>

                  <p className="mt-1 text-sm app-muted">
                    Introduce la cantidad física observada para cada producto.
                  </p>
                </div>

                <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
                  {count.items.length} línea{count.items.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="space-y-3 p-5 sm:p-6">
              {count.items.map((item, index) => {
                const draft = drafts[item.id] ?? {
                  countedQty: "",
                  note: "",
                };

                const countedQty =
                  draft.countedQty === "" ? null : Number(draft.countedQty);

                const expectedQty = Number(item.expectedQty);

                const differenceQty =
                  countedQty === null ? null : countedQty - expectedQty;

                const hasDifference =
                  differenceQty !== null && differenceQty !== 0;

                const isPending = countedQty === null;

                return (
                  <article
                    key={item.id}
                    className={`overflow-hidden rounded-[1.75rem] border transition-all ${
                      isPending
                        ? "border-amber-200 bg-amber-50/30"
                        : hasDifference
                          ? "border-red-100 bg-white/90"
                          : "border-emerald-100 bg-white/90"
                    }`}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-words text-lg font-black tracking-[-0.02em] text-[#201f1d]">
                                {item.product.name}
                              </h3>

                              {isPending ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                                  PENDIENTE
                                </span>
                              ) : hasDifference ? (
                                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                                  DIFERENCIA
                                </span>
                              ) : (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                  CUADRADO
                                </span>
                              )}
                            </div>

                            <div className="mt-2 text-sm app-muted">
                              Unidad: {item.product.unit}
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
                          <div className="rounded-2xl bg-[#f7f4ee] px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Sistema al abrir
                            </div>

                            <div className="mt-1 text-lg font-black text-[#201f1d]">
                              {expectedQty.toFixed(2)} {item.product.unit}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-black/7 bg-white px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Stock actual
                            </div>

                            <div className="mt-1 text-lg font-black text-[#861f23]">
                              {Number(item.product.stock).toFixed(2)}{" "}
                              {item.product.unit}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <label className="block text-sm font-bold text-[#201f1d]">
                          Stock contado físicamente

                          <div className="relative mt-2">
                            <input
                              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-16 text-lg font-black tabular-nums outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:bg-black/3 disabled:text-black/50"
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

                            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-black app-muted">
                              {item.product.unit}
                            </span>
                          </div>
                        </label>

                        <div
                          className={`rounded-[1.25rem] border p-4 ${
                            isPending
                              ? "border-amber-200 bg-amber-50/70"
                              : differenceQty === 0
                                ? "border-emerald-100 bg-emerald-50/70"
                                : "border-red-100 bg-red-50/70"
                          }`}
                        >
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                            Diferencia
                          </div>

                          <div
                            className={`mt-2 text-2xl font-black tracking-[-0.03em] ${differenceClass(
                              differenceQty,
                            )}`}
                          >
                            {differenceQty === null
                              ? "Pendiente"
                              : `${differenceQty > 0 ? "+" : ""}${differenceQty.toFixed(
                                  2,
                                )} ${item.product.unit}`}
                          </div>

                          {!isPending ? (
                            <div className="mt-1 text-xs app-muted">
                              Contado − sistema
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 border-t border-black/7 pt-4">
                        <label className="block text-sm font-bold text-[#201f1d]">
                          Nota de línea

                          <input
                            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:bg-black/3 disabled:text-black/50"
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
                            placeholder={
                              hasDifference
                                ? "Indica una observación si la diferencia lo requiere"
                                : "Observaciones del conteo"
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
