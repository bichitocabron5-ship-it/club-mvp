import { SalesProductCard } from "@/components/sales/sales-product-card";
import type { AddProductOptions } from "@/lib/helpers/sales-cart";
import type { ProductSummary } from "@/lib/types";

export function SalesProductGrid({
  products,
  onAddProduct,
}: {
  products: ProductSummary[];
  onAddProduct: (product: ProductSummary, options?: AddProductOptions) => boolean;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 p-6 text-center text-sm font-semibold app-muted">
        No hay productos con ese código o nombre.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <SalesProductCard
          key={product.id}
          product={product}
          onAddProduct={onAddProduct}
        />
      ))}
    </div>
  );
}
