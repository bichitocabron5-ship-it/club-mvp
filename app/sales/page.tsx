"use client";

import { DAILY_LIMIT_G, DAILY_LIMIT_UD } from "@/lib/sales-rules";
import type { MemberSummary, ProductSummary } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

type TodayTotals = {
  grams: number;
  units: number;
};

type CartItem = {
  productId: number;
  qty: number;
};

type MemberOperationalStatus = {
  member: MemberSummary & {
    active: boolean;
    expiresAt: string | null;
  };
  hasContract: boolean;
  expired: boolean;
  canWithdraw: boolean;
  reasons: {
    inactive: boolean;
    noContract: boolean;
    expired: boolean;
  };
};

const PRODUCT_CATEGORIES = [
  { value: "ALL", label: "Todo" },
  { value: "CANNABIS", label: "Cannabis" },
  { value: "SATIVA", label: "Sativa" },
  { value: "INDICA", label: "Índica" },
  { value: "HYBRID", label: "Híbrida" },
  { value: "CBD", label: "CBD" },
  { value: "RESIN", label: "Resina" },
  { value: "HASH", label: "Hash" },
  { value: "JOINT", label: "Joints" },
  { value: "DRINK", label: "Bebidas" },
  { value: "FOOD", label: "Comida" },
  { value: "MERCH", label: "Merch" },
];

const emptyToday: TodayTotals = {
  grams: 0,
  units: 0,
};

export default function SalesPage() {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [today, setToday] = useState<TodayTotals>(emptyToday);
  const [memberId, setMemberId] = useState("");
  const [memberStatus, setMemberStatus] = useState<MemberOperationalStatus | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rfidInput, setRfidInput] = useState("");
  const [rfidError, setRfidError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  const rfidRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    rfidRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([fetch("/api/members"), fetch("/api/products")]).then(
      async ([membersRes, productsRes]) => {
        const membersData: MemberSummary[] = await membersRes.json();
        const productsData: ProductSummary[] = await productsRes.json();

        if (!cancelled) {
          setMembers(membersData);
          setProducts(productsData);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!memberId) return;

    let cancelled = false;

    void Promise.all([
      fetch(`/api/members/${memberId}/today`),
      fetch(`/api/members/${memberId}/operational-status`),
    ]).then(async ([todayRes, statusRes]) => {
      const todayData: TodayTotals = await todayRes.json();
      const statusData: MemberOperationalStatus = await statusRes.json();

      if (!cancelled) {
        setToday(todayData);
        setMemberStatus(statusData);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const visibleToday = memberId ? today : emptyToday;

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => product.active)
      .filter((product) => {
        if (selectedCategory === "ALL") return true;
        return product.category === selectedCategory;
      })
      .filter((product) => {
        if (!query) return true;
        return product.name.toLowerCase().includes(query);
      });
  }, [products, search, selectedCategory]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();

    if (!q) return members;

    return members.filter((m) => {
      return (
        m.fullName.toLowerCase().includes(q) ||
        String(m.dni || "").toLowerCase().includes(q)
      );
    });
  }, [members, memberSearch]);

  const cartLines = useMemo(() => {
    return cart.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      const price = product ? Number(product.price) : 0;
      const stock = product ? Number(product.stock) : 0;
      const lineTotal = item.qty * price;

      return {
        ...item,
        product,
        price,
        stock,
        lineTotal,
      };
    });
  }, [cart, products]);

  const cartTotal = cartLines.reduce((acc, line) => acc + line.lineTotal, 0);

  const cartG = cartLines.reduce((acc, line) => {
    if (line.product?.unit === "G") return acc + line.qty;
    return acc;
  }, 0);

  const cartUD = cartLines.reduce((acc, line) => {
    if (line.product?.unit === "UD") return acc + line.qty;
    return acc;
  }, 0);

  const gramsAfter = visibleToday.grams + cartG;
  const unitsAfter = visibleToday.units + cartUD;
  const overGrams = gramsAfter > DAILY_LIMIT_G;
  const overUnits = unitsAfter > DAILY_LIMIT_UD;

  const stockProblems = cartLines.filter((line) => {
    if (!line.product) return true;
    return line.qty > line.stock;
  });

  const invalid =
    !memberId ||
    !memberStatus?.canWithdraw ||
    cart.length === 0 ||
    overGrams ||
    overUnits ||
    stockProblems.length > 0 ||
    loading;

  function addProduct(product: ProductSummary) {
    if (Number(product.stock) <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, qty: existing.qty + 1 } : item
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          qty: 1,
        },
      ];
    });
  }

  function updateQty(productId: number, value: string) {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;

    let qty = Number(value);

    if (!Number.isFinite(qty) || qty < 0) qty = 0;
    if (product.unit === "UD") qty = Math.floor(qty);

    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, qty } : item))
    );
  }

  function removeProduct(productId: number) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (invalid) return;

    setLoading(true);

    const res = await fetch("/api/sales/bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memberId: Number(memberId),
        items: cart.filter((item) => item.qty > 0),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const err: { error?: string } = await res.json();
      alert(err.error || "Error al registrar retirada");
      return;
    }

    alert("Retirada registrada");

    setCart([]);

    const refreshedProducts: ProductSummary[] = await fetch("/api/products").then((r) =>
      r.json()
    );
    setProducts(refreshedProducts);

    const refreshedToday: TodayTotals = await fetch(
      `/api/members/${memberId}/today`
    ).then((r) => r.json());
    setToday(refreshedToday);

    setMemberId("");
    setMemberSearch("");
    setRfidInput("");
    setToday(emptyToday);
    setMemberStatus(null);

    setTimeout(() => {
      rfidRef.current?.focus();
    }, 0);
  }

  async function handleRfidSubmit(e: React.FormEvent) {
    e.preventDefault();

    const code = rfidInput.trim();
    if (!code) return;

    setRfidError("");

    const res = await fetch(`/api/members/by-rfid/${encodeURIComponent(code)}`);

    if (!res.ok) {
      setRfidError("Chapita no asignada");
      return;
    }

    const member = await res.json();

    setMemberId(String(member.id));
    setMemberSearch(member.fullName);
    setCart([]);
    setRfidInput("");

    setTimeout(() => {
      rfidRef.current?.focus();
    }, 0);
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">TPV de retiradas</h1>
          <p className="text-sm text-gray-500">
            Modo mostrador/tablet · carrito multi-producto
          </p>
        </div>

        <div className="rounded border bg-blue-50 p-3 text-sm">
          Hoy: <strong>{visibleToday.grams.toFixed(2)} g</strong> / {DAILY_LIMIT_G} g
          {" · "}
          <strong>{visibleToday.units.toFixed(0)} ud</strong> / {DAILY_LIMIT_UD} ud
        </div>
      </div>

      <form onSubmit={handleRfidSubmit} className="rounded border p-3 space-y-2">
        <label className="block text-sm font-medium">Escanear chapita</label>

        <input
          className="w-full rounded border p-3 text-base"
          placeholder="Pasa la chapita por el lector..."
          value={rfidInput}
          onChange={(e) => setRfidInput(e.target.value)}
          autoComplete="off"
          ref={rfidRef}
          autoFocus
        />

        {rfidError && (
          <div className="rounded bg-red-100 p-2 text-sm text-red-700">
            {rfidError}
          </div>
        )}
      </form>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          <div className="rounded border p-3 space-y-3">
            <label className="block text-sm font-medium">Socio</label>

            <input
              className="w-full rounded border p-3 text-base"
              placeholder="Buscar socio por nombre o DNI..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />

            <select
              className="w-full rounded border p-3 text-base"
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value);
                setCart([]);
              }}
              required
            >
              <option value="">Selecciona socio</option>
              {filteredMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} {m.dni ? `— ${m.dni}` : ""}
                </option>
              ))}
            </select>

            {memberId && (
              <button
                type="button"
                onClick={() => {
                  setMemberId("");
                  setMemberSearch("");
                  setCart([]);
                  setToday(emptyToday);
                  setMemberStatus(null);
                  rfidRef.current?.focus();
                }}
                className="rounded border px-3 py-2 text-sm"
              >
                Cambiar socio
              </button>
            )}
          </div>

              {memberStatus && (
                <div className="rounded border p-3 text-sm">
                  <div className="mb-2 font-semibold">Estado del socio</div>

                  <div className="flex flex-wrap gap-2">
                    {memberStatus.member.active ? (
                      <span className="rounded bg-green-100 px-3 py-1 text-green-700">
                        Activo
                      </span>
                    ) : (
                      <span className="rounded bg-red-100 px-3 py-1 text-red-700">
                        Bloqueado
                      </span>
                    )}

                    {memberStatus.hasContract ? (
                      <span className="rounded bg-green-100 px-3 py-1 text-green-700">
                        Contrato firmado
                      </span>
                    ) : (
                      <span className="rounded bg-red-100 px-3 py-1 text-red-700">
                        Sin contrato
                      </span>
                    )}

                    {memberStatus.expired ? (
                      <span className="rounded bg-red-100 px-3 py-1 text-red-700">
                        Membresía caducada
                      </span>
                    ) : (
                      <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                        Membresía vigente
                      </span>
                    )}
                  </div>

                  {!memberStatus.canWithdraw && (
                    <div className="mt-3 rounded bg-red-100 p-2 text-red-700">
                      Este socio no puede realizar retiradas.
                    </div>
                  )}
                </div>
              )}

          <div className="rounded border p-3">
            <label className="mb-1 block text-sm font-medium">
              Buscar producto
            </label>
            <input
              className="w-full rounded border p-3 text-base"
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-medium">Categorías rápidas</div>

            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => setSelectedCategory(category.value)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    selectedCategory === category.value
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {filteredProducts.map((product) => {
              const noStock = Number(product.stock) <= 0;

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  disabled={noStock}
                  className={`min-h-36 rounded-xl border p-4 text-left shadow-sm transition hover:scale-[1.02] disabled:opacity-40 ${
                    noStock ? "bg-gray-100" : "bg-white hover:bg-blue-50"
                  }`}
                >
                  <div className="text-lg font-black">{product.name}</div>

                  <div className="mt-1 text-xs font-bold text-gray-500">
                    {product.category}
                  </div>

                  <div className="mt-2 text-2xl font-bold text-blue-700">
                    {Number(product.price).toFixed(2)} €
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
            })}
          </div>
        </section>

        <aside className="rounded border p-4 lg:sticky lg:top-4 lg:self-start">
          <h2 className="mb-3 text-lg font-bold">Carrito</h2>

          {cartLines.length === 0 && (
            <div className="rounded bg-gray-50 p-3 text-sm text-gray-500">
              Anade productos para registrar una retirada.
            </div>
          )}

          <div className="space-y-3">
            {cartLines.map((line) => (
              <div key={line.productId} className="rounded border p-3">
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{line.product?.name}</div>
                    <div className="text-sm text-gray-500">
                      Stock: {line.stock.toFixed(2)} {line.product?.unit}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeProduct(line.productId)}
                    className="text-sm text-red-600"
                  >
                    Quitar
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Cantidad</label>

                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateQty(line.productId, String(Math.max(0, line.qty - 1)))
                        }
                        className="h-11 w-11 rounded bg-gray-200 text-xl font-bold"
                      >
                        -
                      </button>

                      <input
                        className="h-11 w-24 rounded border p-2 text-center text-lg font-bold"
                        type="number"
                        step={line.product?.unit === "UD" ? "1" : "0.01"}
                        min="0"
                        value={line.qty}
                        onChange={(e) => updateQty(line.productId, e.target.value)}
                      />

                      <button
                        type="button"
                        onClick={() => updateQty(line.productId, String(line.qty + 1))}
                        className="h-11 w-11 rounded bg-gray-900 text-xl font-bold text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500">Total linea</label>
                    <div className="rounded border bg-gray-50 p-2">
                      {line.lineTotal.toFixed(2)} EUR
                    </div>
                  </div>
                </div>

                {line.qty > line.stock && (
                  <div className="mt-2 rounded bg-red-100 p-2 text-sm text-red-700">
                    Stock insuficiente.
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded bg-gray-900 p-4 text-white">
            <div className="text-sm opacity-80">Total retirada</div>
            <div className="text-5xl font-black">{cartTotal.toFixed(2)} EUR</div>
          </div>

          <div className="mt-3 rounded border p-3 text-sm">
            Con carrito:{" "}
            <strong className={overGrams ? "text-red-600" : "text-green-700"}>
              {gramsAfter.toFixed(2)} g
            </strong>
            {" · "}
            <strong className={overUnits ? "text-red-600" : "text-green-700"}>
              {unitsAfter.toFixed(0)} ud
            </strong>
          </div>

          {overGrams && (
            <div className="mt-3 rounded bg-red-100 p-3 text-sm text-red-700">
              Se supera el limite diario de {DAILY_LIMIT_G} g.
            </div>
          )}

          {overUnits && (
            <div className="mt-3 rounded bg-red-100 p-3 text-sm text-red-700">
              Se supera el limite diario de {DAILY_LIMIT_UD} ud.
            </div>
          )}

          {stockProblems.length > 0 && (
            <div className="mt-3 rounded bg-red-100 p-3 text-sm text-red-700">
              Hay productos sin stock suficiente.
            </div>
          )}

          <button
            disabled={invalid}
            className="mt-4 w-full rounded-xl bg-blue-600 p-6 text-2xl font-black text-white shadow-lg disabled:opacity-40"
          >
            {loading ? "Registrando..." : "COBRAR / REGISTRAR"}
          </button>
        </aside>
      </form>
    </main>
  );
}
