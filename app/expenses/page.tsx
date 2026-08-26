"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type Expense = {
  id: number;
  category: string;
  description: string;
  amount: number;
  paidMethod: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancelledByUserId: number | null;
  cancelReason: string | null;
  directCashMoveId: number | null;
  managedByPurchase: boolean;
};

type ExpenseForm = {
  category: string;
  description: string;
  amount: string;
  paidMethod: string;
};

const CATEGORIES = [
  "GENERAL",
  "ALQUILER",
  "LUZ",
  "AGUA",
  "PROVEEDOR",
  "SUELDOS",
  "MANTENIMIENTO",
  "OTROS",
] as const;

const PAYMENT_METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "OTHER", label: "Otro" },
] as const;

const emptyForm: ExpenseForm = {
  category: "GENERAL",
  description: "",
  amount: "",
  paidMethod: "CASH",
};

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Number(value || 0));
}

function formatPaymentMethodLabel(paymentMethod: string) {
  const normalized = paymentMethod.toUpperCase();
  const option = PAYMENT_METHODS.find((item) => item.value === normalized);

  if (option) {
    return option.label;
  }

  if (normalized === "BANK") {
    return "Banco";
  }

  return paymentMethod;
}

function getPaymentMethodOptions(currentValue?: string) {
  if (
    currentValue &&
    !PAYMENT_METHODS.some((item) => item.value === currentValue.toUpperCase())
  ) {
    return [
      ...PAYMENT_METHODS,
      { value: currentValue, label: formatPaymentMethodLabel(currentValue) },
    ];
  }

  return PAYMENT_METHODS;
}

async function readApiError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [editForm, setEditForm] = useState<ExpenseForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const activeExpenses = useMemo(
    () => expenses.filter((expense) => !expense.cancelledAt),
    [expenses]
  );
  const cancelledExpenses = useMemo(
    () => expenses.filter((expense) => expense.cancelledAt),
    [expenses]
  );
  const activeTotal = useMemo(
    () =>
      activeExpenses.reduce(
        (total, expense) => total + Number(expense.amount || 0),
        0
      ),
    [activeExpenses]
  );

  async function loadExpenses() {
    const res = await fetch("/api/expenses");

    if (!res.ok) {
      throw new Error(await readApiError(res, "Error cargando gastos"));
    }

    const data: Expense[] = await res.json();
    setExpenses(data);
  }

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      void loadExpenses().catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Error cargando gastos"
          );
        }
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingKey("create");
    setError("");

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Error creando gasto"));
      }

      setForm(emptyForm);
      await loadExpenses();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Error creando gasto"
      );
    } finally {
      setSavingKey(null);
    }
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id);
    setEditForm({
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      paidMethod: expense.paidMethod,
    });
    setError("");
  }

  async function handleEditSubmit(e: React.FormEvent, expenseId: number) {
    e.preventDefault();
    setSavingKey(`edit-${expenseId}`);
    setError("");

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...editForm,
          amount: Number(editForm.amount),
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Error actualizando gasto"));
      }

      setEditingId(null);
      setEditForm(emptyForm);
      await loadExpenses();
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "Error actualizando gasto"
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function cancelExpense(expense: Expense) {
    const reason = window.prompt(
      "¿Seguro que quieres anular este gasto? Se registrará la corrección en caja.\n\nMotivo opcional:"
    );

    if (reason === null) {
      return;
    }

    setSavingKey(`cancel-${expense.id}`);
    setError("");

    try {
      const res = await fetch(`/api/expenses/${expense.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason,
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Error anulando gasto"));
      }

      if (editingId === expense.id) {
        setEditingId(null);
      }

      await loadExpenses();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : "Error anulando gasto"
      );
    } finally {
      setSavingKey(null);
    }
  }

  function renderPaymentOptions(currentValue?: string) {
    return getPaymentMethodOptions(currentValue).map((method) => (
      <option key={method.value} value={method.value}>
        {method.label}
      </option>
    ));
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <PageHeader
        title="Gastos"
        description="Registra y controla los gastos operativos del club y su impacto en caja."
      />

      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      ) : null}

      <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
              Operación
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Registrar gasto
          </h2>

          <p className="mt-1 text-sm app-muted">
            Añade un gasto e indica su categoría, importe y método de pago.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 p-5 sm:p-6 md:grid-cols-2"
        >
          <label className="block text-sm font-bold text-[#201f1d]">
            Categoría

            <select
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
              value={form.category}
              onChange={(e) =>
                setForm({
                  ...form,
                  category: e.target.value,
                })
              }
              disabled={savingKey !== null}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            Método de pago

            <select
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
              value={form.paidMethod}
              onChange={(e) =>
                setForm({
                  ...form,
                  paidMethod: e.target.value,
                })
              }
              disabled={savingKey !== null}
            >
              {renderPaymentOptions(form.paidMethod)}
            </select>
          </label>

          <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
            Descripción

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
              placeholder="Ej. reparación, material de limpieza, factura eléctrica..."
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
              disabled={savingKey !== null}
              required
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
            Importe

            <div className="relative mt-2">
              <input
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-12 text-xl font-black tabular-nums outline-none placeholder:text-black/25 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amount: e.target.value,
                  })
                }
                disabled={savingKey !== null}
                required
              />

              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-black app-muted">
                €
              </span>
            </div>
          </label>

          <div className="border-t border-black/7 pt-4 md:col-span-2">
            <button
              type="submit"
              className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={savingKey !== null}
            >
              {savingKey === "create" ? "Registrando..." : "Registrar gasto"}
            </button>
          </div>
        </form>
      </section>

      <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Control operativo
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Gastos activos
              </h2>

              <p className="mt-1 text-sm app-muted">
                Gastos vigentes registrados en el sistema.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-2xl border border-black/8 bg-[#f7f4ee] px-4 py-3">
                <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] app-muted">
                  Registros
                </div>

                <div className="mt-1 text-lg font-black tabular-nums text-[#201f1d]">
                  {activeExpenses.length}
                </div>
              </div>

              <div className="rounded-2xl border border-[#a7282d]/15 bg-[#a7282d]/5 px-4 py-3">
                <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#a7282d]/70">
                  Total activo
                </div>

                <div className="mt-1 text-lg font-black tabular-nums text-[#861f23]">
                  {formatCurrency(activeTotal)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {activeExpenses.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
              <div className="font-black text-[#201f1d]">
                No hay gastos activos
              </div>

              <p className="mt-2 text-sm app-muted">
                Los gastos que registres aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeExpenses.map((expense, index) => {
                const isEditing = editingId === expense.id;
                const canMutate = !expense.managedByPurchase;

                return (
                  <article
                    key={expense.id}
                    className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 transition-all hover:border-[#b4a78d]/40 hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)]"
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div className="min-w-0">
                            <div className="break-words text-base font-black text-[#201f1d] sm:text-lg">
                              {expense.description}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full border border-black/8 bg-[#f7f4ee] px-2.5 py-1 text-[0.7rem] font-bold text-[#6d6860]">
                                {expense.category}
                              </span>

                              <span className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[0.7rem] font-bold text-[#6d6860]">
                                {formatPaymentMethodLabel(expense.paidMethod)}
                              </span>

                              {expense.managedByPurchase ? (
                                <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-2.5 py-1 text-[0.7rem] font-bold text-[#645b4c]">
                                  Gestionado en compras
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 text-xs app-muted">
                              {new Date(expense.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
                          <div className="rounded-2xl border border-red-100 bg-red-50/60 px-4 py-2.5 sm:text-right">
                            <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] text-red-700/60">
                              Importe
                            </div>

                            <div className="mt-0.5 text-lg font-black tabular-nums text-[#861f23]">
                              -{formatCurrency(Number(expense.amount))}
                            </div>
                          </div>

                          {canMutate ? (
                            <div className="grid grid-cols-2 gap-2 sm:flex">
                              <button
                                type="button"
                                className={`vale w-full rounded-xl border px-3.5 py-2.5 text-sm font-bold transition disabled:opacity-60 sm:w-auto ${
                                  isEditing
                                    ? "border-[#a7282d]/20 bg-[#a7282d]/8 text-[#861f23]"
                                    : "border-black/10 bg-white text-[#201f1d] hover:border-[#b4a78d]/50 hover:bg-[#f7f4ee]"
                                }`}
                                onClick={() => startEdit(expense)}
                                disabled={savingKey !== null}
                              >
                                {isEditing ? "Editando" : "Editar"}
                              </button>

                              <button
                                type="button"
                                className="w-full rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60 sm:w-auto"
                                onClick={() => void cancelExpense(expense)}
                                disabled={savingKey !== null}
                              >
                                {savingKey === `cancel-${expense.id}`
                                  ? "Anulando..."
                                  : "Anular"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {isEditing ? (
                        <form
                          onSubmit={(event) =>
                            void handleEditSubmit(event, expense.id)
                          }
                          className="mt-5 overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/30 bg-[#f7f4ee]/70"
                        >
                          <div className="border-b border-[#b4a78d]/20 px-4 py-4 sm:px-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="h-[2px] w-5 rounded-full bg-[#a7282d]" />

                                  <span className="text-[0.62rem] font-black uppercase tracking-[0.18em] text-[#a7282d]">
                                    Edición
                                  </span>
                                </div>

                                <h4 className="font-black text-[#201f1d]">
                                  Modificar gasto
                                </h4>

                                <p className="mt-1 text-xs app-muted">
                                  Actualiza los datos del registro seleccionado.
                                </p>
                              </div>

                              <span className="rounded-full border border-[#b4a78d]/30 bg-white/70 px-3 py-1 text-xs font-bold text-[#645b4c]">
                                #{expense.id}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
                            <label className="block text-sm font-bold text-[#201f1d]">
                              Categoría

                              <select
                                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                                value={editForm.category}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    category: e.target.value,
                                  })
                                }
                                disabled={savingKey !== null}
                              >
                                {CATEGORIES.map((category) => (
                                  <option key={category} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block text-sm font-bold text-[#201f1d]">
                              Método de pago

                              <select
                                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                                value={editForm.paidMethod}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    paidMethod: e.target.value,
                                  })
                                }
                                disabled={savingKey !== null}
                              >
                                {renderPaymentOptions(editForm.paidMethod)}
                              </select>
                            </label>

                            <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
                              Descripción

                              <input
                                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                                placeholder="Descripción"
                                value={editForm.description}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    description: e.target.value,
                                  })
                                }
                                disabled={savingKey !== null}
                                required
                              />
                            </label>

                            <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
                              Importe

                              <div className="relative mt-2">
                                <input
                                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-12 text-xl font-black tabular-nums outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  placeholder="0,00"
                                  value={editForm.amount}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      amount: e.target.value,
                                    })
                                  }
                                  disabled={savingKey !== null}
                                  required
                                />

                                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-black app-muted">
                                  €
                                </span>
                              </div>
                            </label>
                          </div>

                          <div className="flex flex-col-reverse gap-2 border-t border-[#b4a78d]/20 bg-white/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-5">
                            <button
                              type="button"
                              className="app-button-secondary inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                              onClick={() => setEditingId(null)}
                              disabled={savingKey !== null}
                            >
                              Cancelar edición
                            </button>

                            <button
                              type="submit"
                              className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                              disabled={savingKey !== null}
                            >
                              {savingKey === `edit-${expense.id}`
                                ? "Guardando cambios..."
                                : "Guardar cambios"}
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Auditoría
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Gastos anulados
              </h2>

              <p className="mt-1 text-sm app-muted">
                Registros conservados por trazabilidad que ya no forman parte del gasto activo.
              </p>
            </div>

            <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1.5 text-xs font-bold text-[#6d6860]">
              {cancelledExpenses.length} anulado
              {cancelledExpenses.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {cancelledExpenses.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/8 bg-white/60 p-6 text-center">
              <div className="font-black text-[#201f1d]">
                No hay gastos anulados
              </div>

              <p className="mt-2 text-sm app-muted">
                Los gastos anulados se conservarán aquí para mantener la trazabilidad.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cancelledExpenses.map((expense, index) => (
                <article
                  key={expense.id}
                  className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-[#f7f4ee]/55"
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white/70 px-2 text-xs font-black text-[#8b857c]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="break-words text-base font-black text-[#5f5a53] sm:text-lg">
                              {expense.description}
                            </h3>

                            <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[0.68rem] font-black text-[#6d6860]">
                              ANULADO
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[0.7rem] font-bold text-[#777169]">
                              {expense.category}
                            </span>

                            <span className="rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[0.7rem] font-bold text-[#777169]">
                              {formatPaymentMethodLabel(expense.paidMethod)}
                            </span>

                            {expense.managedByPurchase ? (
                              <span className="rounded-full border border-[#b4a78d]/25 bg-[#f3f0e9]/70 px-2.5 py-1 text-[0.7rem] font-bold text-[#777169]">
                                Gestionado en compras
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-xs text-[#8b857c]">
                            Registrado:{" "}
                            {new Date(expense.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 rounded-2xl border border-black/8 bg-white/60 px-4 py-3 lg:text-right">
                        <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] text-[#8b857c]">
                          Importe anulado
                        </div>

                        <div className="mt-1 text-lg font-black tabular-nums text-[#6d6860] line-through decoration-black/25">
                          {formatCurrency(Number(expense.amount))}
                        </div>
                      </div>
                    </div>

                    {expense.cancelReason ? (
                      <div className="mt-4 rounded-[1.25rem] border border-black/8 bg-white/55 px-4 py-3">
                        <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[#8b857c]">
                          Motivo de anulación
                        </div>

                        <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#5f5a53]">
                          {expense.cancelReason}
                        </div>
                      </div>
                    ) : null}

                    {expense.cancelledAt ? (
                      <div className="mt-3 text-xs text-[#8b857c]">
                        Anulado el{" "}
                        {new Date(expense.cancelledAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
