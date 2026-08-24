"use client";

import { SalesCart } from "@/components/sales/sales-cart";
import { SalesMemberSearch } from "@/components/sales/sales-member-search";
import { SalesMemberStatus } from "@/components/sales/sales-member-status";
import { SalesPageHeader } from "@/components/sales/sales-page-header";
import { SalesProductControls } from "@/components/sales/sales-product-controls";
import { SalesProductGrid } from "@/components/sales/sales-product-grid";
import { SalesRecentSales } from "@/components/sales/sales-recent-sales";
import { SalesRfidInput } from "@/components/sales/sales-rfid-input";
import { EmptyState } from "@/components/ui/empty-state";
import { useSalesPage } from "@/hooks/use-sales-page";

export default function SalesPage() {
  const sales = useSalesPage();

  return (
    <main
      className="mx-auto max-w-7xl p-4 md:p-6"
      onKeyDownCapture={sales.handleRfidScannerKeyDownCapture}
    >
      <SalesPageHeader
        showRecentSales={sales.showRecentSales}
        visibleToday={sales.visibleToday}
        visibleTodayLoading={sales.memberStatusLoading}
        onToggleRecentSales={() =>
          sales.setShowRecentSales((current) => !current)
        }
      />

      {sales.error && <EmptyState message={sales.error} className="mb-4" />}

      <SalesRfidInput
        rfidError={sales.rfidError}
        rfidInput={sales.rfidInput}
        rfidRef={sales.rfidRef}
        onFocusRfid={sales.focusRfidInput}
        onRfidInputChange={sales.setRfidInput}
        onSubmit={sales.handleRfidSubmit}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.7fr)]">
        <section className="space-y-4">
          <SalesMemberSearch
            filteredMembers={sales.filteredMembers}
            memberId={sales.memberId}
            memberRecentSalesError={sales.memberRecentSalesError}
            memberRecentSalesLoading={sales.memberRecentSalesLoading}
            memberRecentSummary={sales.memberRecentSummary}
            memberSearch={sales.memberSearch}
            onClearMember={sales.handleNextMember}
            onMemberChange={sales.handleMemberChange}
            onMemberSearchChange={sales.setMemberSearch}
          />

          <SalesMemberStatus
            loading={sales.memberStatusLoading}
            memberStatus={sales.memberStatus}
          />

          <SalesProductControls
            availableHashTypes={sales.availableHashTypes}
            categories={sales.productCategories}
            productSearchRef={sales.productSearchRef}
            search={sales.search}
            selectedCategory={sales.selectedCategory}
            selectedHashType={sales.selectedHashType}
            onCategoryFilter={sales.handleCategoryFilter}
            onHashTypeFilter={sales.handleHashTypeFilter}
            onProductSearchKeyDown={sales.handleProductSearchKeyDown}
            onSearchChange={sales.setSearch}
          />

          <SalesProductGrid
            products={sales.filteredProducts}
            onAddProduct={sales.addProduct}
          />
        </section>

        <SalesCart
          cartLines={sales.cartLines}
          cartTotals={sales.cartTotals}
          invalid={sales.invalid}
          loading={sales.loading}
          visibleToday={sales.visibleToday}
          visibleTodayLoading={sales.memberStatusLoading}
          onCartValueKeyDown={sales.handleCartValueKeyDown}
          onCartValueInputRef={sales.setCartValueInputRef}
          onNextMember={sales.handleNextMember}
          onRegisterButtonKeyDown={sales.handleRegisterButtonKeyDown}
          onRegisterWithdrawal={() => void sales.handleRegisterWithdrawal()}
          onRemoveProduct={sales.removeProduct}
          onUpdateAmount={sales.updateAmount}
          onUpdateInputMode={sales.updateInputMode}
          onUpdateQty={sales.updateQty}
        />
      </div>

      <SalesRecentSales
        cancelingSaleId={sales.cancelingSaleId}
        recentSales={sales.recentSales}
        recentSalesDayClosed={sales.recentSalesDayClosed}
        recentSalesError={sales.recentSalesError}
        showRecentSales={sales.showRecentSales}
        onCancelRecentSale={sales.handleCancelRecentSale}
        onRefreshRecentSales={sales.handleRefreshRecentSales}
      />
    </main>
  );
}
