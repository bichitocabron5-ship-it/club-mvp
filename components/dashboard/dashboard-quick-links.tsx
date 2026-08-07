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
    <section className="app-panel-strong rounded-[2rem] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Accesos rápidos</h2>
          <p className="mt-1 text-sm app-muted">Atajos a las tareas del turno.</p>
        </div>
      </div>

      {links.length === 0 ? (
        <EmptyState
          title="Sin accesos directos"
          message="No hay atajos visibles para esta vista del dashboard."
          className="rounded-[1.5rem] bg-white/70"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="min-h-24 rounded-[1.5rem] border border-black/8 bg-white/80 p-4 outline-none hover:-translate-y-0.5 hover:border-black/12 focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
            >
              <div className="break-words text-base font-black">{link.label}</div>
              <div className="mt-1 break-words text-sm app-muted">
                {link.description}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
