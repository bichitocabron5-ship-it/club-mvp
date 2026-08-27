"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  formatCurrencyLabel,
  formatQtyLabel,
  formatTimeLabel,
} from "@/lib/helpers/sales-formatters";
import type { RecentSale } from "@/lib/helpers/sales-cart";

const FOCUSABLE_DIALOG_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getRecentSaleAmount(sale: RecentSale) {
  return sale.finalAmount ?? sale.totalAmount;
}

export function SalesRecentSales({
  cancelingSaleId,
  recentSales,
  recentSalesDayClosed,
  recentSalesError,
  showRecentSales,
  onCancelRecentSale,
  onRefreshRecentSales,
}: {
  cancelingSaleId: number | null;
  recentSales: RecentSale[];
  recentSalesDayClosed: boolean;
  recentSalesError: string;
  showRecentSales: boolean;
  onCancelRecentSale: (sale: RecentSale, reason: string) => Promise<void>;
  onRefreshRecentSales: () => void;
}) {
  const [cancelDialogSale, setCancelDialogSale] = useState<RecentSale | null>(
    null
  );
  const [cancelReason, setCancelReason] = useState("");
  const [cancelDialogError, setCancelDialogError] = useState("");
  const [cancelDialogSubmitting, setCancelDialogSubmitting] = useState(false);
  const cancelDialogSubmittingRef = useRef(false);
  const cancelDialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const refreshButtonRef = useRef<HTMLButtonElement | null>(null);

  const restoreCancelDialogFocus = () => {
    window.setTimeout(() => {
      const trigger = cancelDialogTriggerRef.current;

      if (trigger?.isConnected && !trigger.disabled) {
        trigger.focus();
        return;
      }

      refreshButtonRef.current?.focus();
    }, 0);
  };

  const resetCancelDialog = () => {
    setCancelDialogSale(null);
    setCancelReason("");
    setCancelDialogError("");
    restoreCancelDialogFocus();
  };

  const handleOpenCancelDialog = (
    sale: RecentSale,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    if (!sale.canCancel || recentSalesDayClosed || cancelingSaleId !== null) {
      return;
    }

    cancelDialogTriggerRef.current = event.currentTarget;
    setCancelDialogSale(sale);
    setCancelReason("");
    setCancelDialogError("");
  };

  const handleCloseCancelDialog = () => {
    if (cancelDialogSubmitting || cancelingSaleId !== null) {
      return;
    }

    resetCancelDialog();
  };

  const handleSubmitCancelDialog = async () => {
    if (
      !cancelDialogSale ||
      cancelDialogSubmittingRef.current ||
      cancelingSaleId !== null ||
      !cancelReason.trim()
    ) {
      return;
    }

    cancelDialogSubmittingRef.current = true;
    setCancelDialogSubmitting(true);
    setCancelDialogError("");

    try {
      await onCancelRecentSale(cancelDialogSale, cancelReason);
      resetCancelDialog();
    } catch (err) {
      setCancelDialogError(
        err instanceof Error ? err.message : "Error anulando retirada"
      );
    } finally {
      cancelDialogSubmittingRef.current = false;
      setCancelDialogSubmitting(false);
    }
  };

  return (
    <section
      id="recent-sales-panel"
      hidden={!showRecentSales}
      className="app-panel mt-4 rounded-3xl p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Últimas retiradas de hoy</h2>
          {recentSalesDayClosed ? (
            <div className="mt-1 text-xs text-amber-700">
              El día está cerrado; no se pueden anular retiradas.
            </div>
          ) : null}
        </div>
        <button
          ref={refreshButtonRef}
          type="button"
          onClick={onRefreshRecentSales}
          className="app-button-secondary rounded-full px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        >
          Actualizar
        </button>
      </div>

      {recentSalesError ? (
        <div className="rounded-2xl bg-red-100 p-3 text-sm text-red-700">
          {recentSalesError}
        </div>
      ) : recentSales.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 p-4 text-sm app-muted">
          No hay retiradas registradas hoy.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {recentSales.map((sale) => {
            const cancelled = Boolean(sale.cancelledAt);
            const amount = getRecentSaleAmount(sale);

            return (
              <div
                key={sale.id}
                className={`rounded-2xl border border-black/8 bg-white/82 p-3 ${
                  cancelled ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      <span>#{sale.id}</span>
                      <span>{sale.product.name}</span>
                      {cancelled ? (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                          Anulada
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm app-muted">
                      {sale.member.fullName} -{" "}
                      {formatQtyLabel(
                        sale.qty,
                        sale.product.unit === "UD" ? "UD" : "G"
                      )}{" "}
                      - {formatTimeLabel(sale.createdAt)}
                    </div>
                    {cancelled && sale.cancelReason ? (
                      <div className="mt-1 text-xs text-red-700">
                        Motivo: {sale.cancelReason}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-black ${
                        cancelled ? "app-muted line-through" : ""
                      }`}
                    >
                      {formatCurrencyLabel(amount)}
                    </div>
                    {!cancelled ? (
                      <button
                        type="button"
                        onClick={(event) => handleOpenCancelDialog(sale, event)}
                        disabled={
                          !sale.canCancel ||
                          recentSalesDayClosed ||
                          cancelingSaleId !== null
                        }
                        className="mt-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:opacity-40"
                      >
                        {cancelingSaleId === sale.id ? "Anulando..." : "Anular"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelDialogSale ? (
        <SalesCancelSaleDialog
          error={cancelDialogError}
          isSubmitting={
            cancelDialogSubmitting || cancelingSaleId === cancelDialogSale.id
          }
          reason={cancelReason}
          sale={cancelDialogSale}
          onClose={handleCloseCancelDialog}
          onReasonChange={setCancelReason}
          onSubmit={() => {
            void handleSubmitCancelDialog();
          }}
        />
      ) : null}
    </section>
  );
}

function SalesCancelSaleDialog({
  error,
  isSubmitting,
  reason,
  sale,
  onClose,
  onReasonChange,
  onSubmit,
}: {
  error: string;
  isSubmitting: boolean;
  reason: string;
  sale: RecentSale;
  onClose: () => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmedReason = reason.trim();
  const titleId = `cancel-sale-title-${sale.id}`;
  const descriptionId = `cancel-sale-description-${sale.id}`;
  const errorId = `cancel-sale-error-${sale.id}`;
  const amount = getRecentSaleAmount(sale);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      reasonRef.current?.focus();
      reasonRef.current?.select();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [sale.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function getFocusableElements() {
    const dialog = dialogRef.current;

    if (!dialog) return [];

    return Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_DIALOG_SELECTOR)
    ).filter((element) => !element.hasAttribute("disabled"));
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();

      if (!isSubmitting) {
        onClose();
      }

      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements();

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (
      event.shiftKey &&
      (activeElement === firstElement ||
        !dialogRef.current?.contains(activeElement))
    ) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || !trimmedReason) {
      return;
    }

    onSubmit();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 px-4 py-6 backdrop-blur-sm sm:px-6">
      <div className="flex min-h-full items-center justify-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onKeyDown={handleDialogKeyDown}
          className="w-full max-w-xl rounded-3xl border border-black/12 bg-white p-4 shadow-2xl outline-none sm:p-5"
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-red-700">
                  Acción destructiva
                </p>
                <h3 id={titleId} className="mt-1 text-xl font-black">
                  Anular retirada #{sale.id}
                </h3>
              </div>
              <span className="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
                Anulación
              </span>
            </div>

            <div
              id={descriptionId}
              className="grid gap-3 rounded-2xl border border-black/10 bg-[#f7f4ee] p-3 text-sm sm:grid-cols-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase app-muted">
                  Socio
                </div>
                <div className="mt-1 truncate font-black">
                  {sale.member.fullName}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase app-muted">
                  Producto
                </div>
                <div className="mt-1 truncate font-black">
                  {sale.product.name}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase app-muted">
                  Cantidad
                </div>
                <div className="mt-1 font-black tabular-nums">
                  {formatQtyLabel(
                    sale.qty,
                    sale.product.unit === "UD" ? "UD" : "G"
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase app-muted">
                  Importe
                </div>
                <div className="mt-1 font-black tabular-nums">
                  {formatCurrencyLabel(amount)}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor={`cancel-sale-reason-${sale.id}`}
                className="text-sm font-black"
              >
                Motivo obligatorio
              </label>
              <textarea
                ref={reasonRef}
                id={`cancel-sale-reason-${sale.id}`}
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
                readOnly={isSubmitting}
                rows={4}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-black/10 bg-white p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
              />
            </div>

            {error ? (
              <div
                id={errorId}
                role="alert"
                aria-atomic="true"
                className="rounded-2xl border border-red-200 bg-red-100 p-3 text-sm font-semibold text-red-800"
              >
                {error}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="app-button-secondary inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !trimmedReason}
                className="app-button-danger inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-3 text-sm font-black outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Anulando..." : "Confirmar anulación"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
