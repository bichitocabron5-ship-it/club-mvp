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
        noStock ? "bg-gray-100" : "bg-white hover:bg-blue-50"
      }`}
    >
      <div className="text-lg font-black">
        {product.sku ? `${product.sku} · ${product.name}` : product.name}
      </div>

      <div className="mt-1 text-xs font-bold text-gray-500">
        {product.category}
        {product.hashType ? ` · ${getSalesHashTypeLabel(product.hashType)}` : ""}
      </div>

      <div className="mt-2 text-2xl font-bold text-blue-700">
        {Number(product.price).toFixed(2)} EUR
      </div>

      <div className="text-xs text-gray-500">
        por {product.unit === "G" ? "gramo" : "unidad"}
      </div>

      <div className="mt-3 text-sm">
        Stock:{" "}
        <strong>
          {Number(product.stock).toFixed(2)} {product.unit}
        </strong>
      </div>

      <div className="mt-3 rounded bg-gray-900 px-3 py-2 text-center text-sm font-bold text-white">
        {noStock ? "SIN STOCK" : "AÑADIR"}
      </div>
    </button>
  );
}
