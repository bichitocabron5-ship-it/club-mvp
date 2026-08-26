import { getSalesHashTypeLabel } from "@/lib/helpers/sales-formatters";
import type { AddProductOptions } from "@/lib/helpers/sales-cart";
import type { ProductSummary } from "@/lib/types";

export function SalesProductCard({
  product,
  onAddProduct,
}: {
  product: ProductSummary;
  onAddProduct: (product: ProductSummary, options?: AddProductOptions) => boolean;
}) {
  const noStock = Number(product.stock) <= 0;

  return (
    <button
      type="button"
      onClick={() => onAddProduct(product, { focusInput: true })}
      disabled={noStock}
      className={`min-h-36 rounded-xl border p-4 text-left shadow-sm outline-none transition hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:opacity-40 ${
        noStock ? "bg-[#f3f0e9]" : "bg-white hover:bg-[#f7f4ee]"
      }`}
    >
      <div className="text-lg font-black">
        {product.sku ? `${product.sku} · ${product.name}` : product.name}
      </div>

      <div className="mt-1 text-xs font-bold app-muted">
        {product.category}
        {product.hashType ? ` · ${getSalesHashTypeLabel(product.hashType)}` : ""}
      </div>

      <div className="mt-2 text-2xl font-bold text-[#861f23]">
        {Number(product.price).toFixed(2)} EUR
      </div>

      <div className="text-xs app-muted">
        por {product.unit === "G" ? "gramo" : "unidad"}
      </div>

      <div className="mt-3 text-sm">
        Stock:{" "}
        <strong>
          {Number(product.stock).toFixed(2)} {product.unit}
        </strong>
      </div>

      <div className="mt-3 rounded-xl bg-[#0b0b0c] px-3 py-2 text-center text-sm font-bold text-white">
        {noStock ? "SIN STOCK" : "AÑADIR"}
      </div>
    </button>
  );
}
