import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";

export type DashboardQuickLink = {
  href: string;
  label: string;
  description: string;
};

export const adminDashboardQuickLinks: DashboardQuickLink[] = [
  { href: "/sales", label: "TPV", description: "Registrar ventas" },
  { href: "/cash", label: "Caja", description: "Cierre y movimientos" },
  { href: "/stock/counts", label: "Conteos", description: "Inventario abierto" },
  { href: "/stock", label: "Stock", description: "Niveles y ajustes" },
  { href: "/admin/settings", label: "Límites", description: "Topes y consumo" },
  { href: "/admin/audit", label: "Auditoría", description: "Trazabilidad" },
  { href: "/members/new", label: "Alta socio", description: "Nuevo miembro" },
];

export const staffDashboardQuickLinks: DashboardQuickLink[] = [
  { href: "/sales", label: "TPV", description: "Registrar ventas" },
  { href: "/members", label: "Socios", description: "Buscar y consultar" },
  { href: "/access", label: "Acceso", description: "Entradas y salidas" },
  { href: "/stock", label: "Stock", description: "Stock bajo" },
];

export function DashboardQuickLinks({
  links,
}: {
  links: DashboardQuickLink[];
}) {
  return (
    <section className="app-panel-strong overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                Operativa
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Accesos rápidos
            </h2>

            <p className="mt-1 text-sm app-muted">
              Atajos a las tareas habituales del turno.
            </p>
          </div>

          <div
            aria-hidden="true"
            className="hidden rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860] sm:block"
          >
            {links.length} accesos
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {links.length === 0 ? (
          <EmptyState
            title="Sin accesos directos"
            message="No hay atajos visibles para esta vista del dashboard."
            className="rounded-[1.5rem] bg-white/70"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {links.map((link, index) => (
              <Link
                key={link.href}
                href={link.href}
                className="group relative min-h-28 overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4 outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-[#a7282d]/25 hover:shadow-[0_14px_36px_rgba(22,20,18,0.09)] focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
              >
                <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-[#a7282d]/[0.035] transition-colors group-hover:bg-[#a7282d]/[0.065]" />

                <div className="relative flex h-full flex-col">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span
                      aria-hidden="true"
                      className="text-lg font-black text-[#a7282d]/55 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#a7282d]"
                    >
                      →
                    </span>
                  </div>

                  <div className="break-words text-base font-black tracking-[-0.01em] text-[#201f1d]">
                    {link.label}
                  </div>

                  <div className="mt-1 break-words text-sm leading-5 app-muted">
                    {link.description}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
