"use client";

import { CashActions } from "@/components/cash/cash-actions";
import { CashCloseDialog } from "@/components/cash/cash-close-dialog";
import { CashMovementsTable } from "@/components/cash/cash-movements-table";
import { CashOpenDialog } from "@/components/cash/cash-open-dialog";
import { CashProductsWithdrawn } from "@/components/cash/cash-products-withdrawn";
import { CashReopenDialog } from "@/components/cash/cash-reopen-dialog";
import { CashStatusBar } from "@/components/cash/cash-status-bar";
import { CashSummary } from "@/components/cash/cash-summary";
import { useCashPage } from "@/hooks/use-cash-page";
import { PageHeader } from "@/components/ui/page-header";

export default function CashPage() {
  const cash = useCashPage();

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <PageHeader
        title="Caja"
        description="Apertura de turno, control de efectivo, cierre diario y trazabilidad operativa."
      />

    <div className="space-y-5">
      <CashStatusBar
        dayStatus={cash.dayStatus}
        closure={cash.closure}
        csvHref={cash.csvHref}
      />

      <CashActions
        error={cash.error}
        autoCheckoutMessage={cash.autoCheckoutMessage}
        inventoryCountsOpenCount={cash.inventoryCountsOpenCount}
        accessStatus={cash.accessStatus}
        isReopened={cash.isReopened}
        closure={cash.closure}
        saving={cash.saving}
        onAutoCheckout={() => void cash.handleAutoCheckout()}
      />

      <CashOpenDialog
        isVisible={cash.dayStatus === "PENDING"}
        isAdmin={cash.isAdmin}
        saving={cash.saving}
        openingCash={cash.openingCash}
        onOpeningCashChange={cash.setOpeningCash}
        onOpenDay={() => void cash.openDay()}
      />

      <CashSummary
        summary={cash.summary}
        closure={cash.closure}
        isClosed={cash.isClosed}
        expectedCash={cash.expectedCash}
        countedValue={cash.countedValue}
        draftDifference={cash.draftDifference}
      />

      {cash.isClosed ? (
        <CashReopenDialog
          closure={cash.closure}
          isAdmin={cash.isAdmin}
          saving={cash.saving}
          reopenReason={cash.reopenReason}
          onReopenReasonChange={cash.setReopenReason}
          onReopenDay={() => void cash.reopenDay()}
        />
      ) : (
        <CashCloseDialog
          isVisible={cash.canPrepareClosure}
          isAdmin={cash.isAdmin}
          saving={cash.saving}
          summary={cash.summary}
          inventoryOptions={cash.inventoryOptions}
          inventoryCountId={cash.inventoryCountId}
          countedCash={cash.countedCash}
          note={cash.note}
          noteRequired={cash.noteRequired}
          draftDifference={cash.draftDifference}
          responsibleLabel={cash.responsibleLabel}
          onInventoryCountIdChange={cash.setInventoryCountId}
          onCountedCashChange={cash.setCountedCash}
          onNoteChange={cash.setNote}
          onCloseDay={() => void cash.closeDay()}
        />
      )}

      <CashProductsWithdrawn summary={cash.summary} />

      <CashMovementsTable
        todayMoves={cash.todayMoves}
        groupedMoves={cash.groupedMoves}
        orderedGroups={cash.orderedGroups}
      />
      </div>
    </main>
  );
}
