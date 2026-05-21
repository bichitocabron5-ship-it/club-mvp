"use client";

import type { CatalogProductSummary } from "@/lib/types";
import { ProductMenu } from "@/components/catalog/product-menu";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function CatalogBrowser() {
  const router = useRouter();
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      setLoading(true);

      try {
        const response = await fetch("/api/catalog/products", {
          cache: "no-store",
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (response.status === 401) {
            startTransition(() => {
              router.refresh();
            });
            return;
          }
          throw new Error(data?.error || "No se pudo cargar el catálogo");
        }

        const data = (await response.json()) as CatalogProductSummary[];

        if (active) {
          setProducts(data);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "No se pudo cargar el catálogo"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await fetch("/api/catalog/session", {
        method: "DELETE",
      });
    } finally {
      startTransition(() => {
        router.refresh();
      });
      setLoggingOut(false);
    }
  }

  return (
    <ProductMenu
      badge="Modo catálogo"
      title="Catálogo visual"
      description="Consulta rápida para mostrar el catálogo al socio en tablet o mostrador."
      products={products}
      loading={loading}
      error={error}
      note="Solo lectura. Consulta protegida por clave de catálogo y sin datos internos."
      logoutLabel="Salir del catálogo"
      loggingOut={loggingOut}
      onLogout={handleLogout}
    />
  );
}
