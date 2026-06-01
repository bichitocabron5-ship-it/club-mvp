"use client";

import { useEffect, useMemo, useState } from "react";

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

function formatCurrency(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
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
    <main className="mx-auto max-w-4xl p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-bold">Gastos</h1>

      {error ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mb-6 space-y-2 rounded border p-4">
        <select
          className="w-full border p-3"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          disabled={savingKey !== null}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <input
          className="w-full border p-3"
          placeholder="Descripción"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          disabled={savingKey !== null}
          required
        />

        <input
          className="w-full border p-3"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Importe"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          disabled={savingKey !== null}
          required
        />

        <select
          className="w-full border p-3"
          value={form.paidMethod}
          onChange={(e) => setForm({ ...form, paidMethod: e.target.value })}
          disabled={savingKey !== null}
        >
          {renderPaymentOptions(form.paidMethod)}
        </select>

        <button
          className="w-full bg-red-600 p-3 font-bold text-white disabled:opacity-60"
          disabled={savingKey !== null}
        >
          {savingKey === "create" ? "Registrando..." : "Registrar gasto"}
        </button>
      </form>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Gastos activos</h2>
          <div className="rounded bg-gray-100 px-3 py-2 text-sm font-semibold">
            Total activo: {formatCurrency(activeTotal)}
          </div>
        </div>

        <div className="space-y-2">
          {activeExpenses.map((expense) => {
            const isEditing = editingId === expense.id;
            const canMutate = !expense.managedByPurchase;

            return (
              <div key={expense.id} className="rounded border p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-semibold">{expense.description}</div>
                    <div className="text-sm text-gray-500">
                      {expense.category} · {formatPaymentMethodLabel(expense.paidMethod)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(expense.createdAt).toLocaleString()}
                    </div>
                    {expense.managedByPurchase ? (
                      <div className="mt-2 inline-flex rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        Gestionado en compras
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <strong className="text-red-600">
                      -{formatCurrency(Number(expense.amount))}
                    </strong>

                    {canMutate ? (
                      <>
                        <button
                          type="button"
                          className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                          onClick={() => startEdit(expense)}
                          disabled={savingKey !== null}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="rounded border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                          onClick={() => void cancelExpense(expense)}
                          disabled={savingKey !== null}
                        >
                          {savingKey === `cancel-${expense.id}`
                            ? "Anulando..."
                            : "Anular"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <form
                    onSubmit={(event) => void handleEditSubmit(event, expense.id)}
                    className="mt-3 grid gap-2 rounded bg-gray-50 p-3 md:grid-cols-2"
                  >
                    <select
                      className="border p-3"
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm({ ...editForm, category: e.target.value })
                      }
                      disabled={savingKey !== null}
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>

                    <select
                      className="border p-3"
                      value={editForm.paidMethod}
                      onChange={(e) =>
                        setEditForm({ ...editForm, paidMethod: e.target.value })
                      }
                      disabled={savingKey !== null}
                    >
                      {renderPaymentOptions(editForm.paidMethod)}
                    </select>

                    <input
                      className="border p-3"
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

                    <input
                      className="border p-3"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Importe"
                      value={editForm.amount}
                      onChange={(e) =>
                        setEditForm({ ...editForm, amount: e.target.value })
                      }
                      disabled={savingKey !== null}
                      required
                    />

                    <div className="flex gap-2 md:col-span-2">
                      <button
                        className="rounded bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
                        disabled={savingKey !== null}
                      >
                        {savingKey === `edit-${expense.id}`
                          ? "Guardando..."
                          : "Guardar"}
                      </button>
                      <button
                        type="button"
                        className="rounded border px-4 py-2 font-semibold disabled:opacity-60"
                        onClick={() => setEditingId(null)}
                        disabled={savingKey !== null}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })}

          {activeExpenses.length === 0 ? (
            <div className="rounded border p-3 text-sm text-gray-500">
              No hay gastos activos.
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Gastos anulados</h2>

        <div className="space-y-2">
          {cancelledExpenses.map((expense) => (
            <div key={expense.id} className="rounded border bg-gray-50 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-semibold text-gray-700">
                    {expense.description}
                  </div>
                  <div className="text-sm text-gray-500">
                    {expense.category} · {formatPaymentMethodLabel(expense.paidMethod)}
                  </div>
                  <div className="text-xs text-gray-400">
                    Anulado el{" "}
                    {expense.cancelledAt
                      ? new Date(expense.cancelledAt).toLocaleString()
                      : "-"}
                  </div>
                  {expense.cancelReason ? (
                    <div className="mt-1 text-sm text-gray-500">
                      Motivo: {expense.cancelReason}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <span className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">
                    Anulado
                  </span>
                  <strong className="text-gray-500">
                    -{formatCurrency(Number(expense.amount))}
                  </strong>
                </div>
              </div>
            </div>
          ))}

          {cancelledExpenses.length === 0 ? (
            <div className="rounded border p-3 text-sm text-gray-500">
              No hay gastos anulados.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
