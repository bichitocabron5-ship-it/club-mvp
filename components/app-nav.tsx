"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";

const commonLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/access", label: "Acceso" },
  { href: "/sales", label: "Retiradas" },
  { href: "/members", label: "Socios" },
  { href: "/products", label: "Productos" },
];

const adminLinks = [
  { href: "/admin/users", label: "Admin" },
  { href: "/admin/audit", label: "Auditoría" },
  { href: "/cash", label: "Caja" },
  { href: "/expenses", label: "Gastos" },
  { href: "/suppliers", label: "Proveedores" },
  { href: "/purchases", label: "Compras" },
  { href: "/stock", label: "Stock" },
];

export function AppNav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (pathname.startsWith("/catalog")) {
    return null;
  }

  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const showNav = status === "authenticated";

  function linkClass(href: string) {
    const active = pathname === href;

    return [
      "rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap",
      active
        ? "bg-white text-[#1f4036] shadow-sm"
        : "text-white/78 hover:bg-white/10 hover:text-white",
    ].join(" ");
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#1e2a1f]/92 text-white backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-bold uppercase tracking-[0.28em] text-[#c6dea3]">
              Club
            </span>
            <div>
              <div className="text-base font-black tracking-[0.08em]">Club MVP</div>
              <div className="text-xs text-white/55">Gestión operativa</div>
            </div>
          </Link>

          {showNav && (
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white/72">
                {isAdmin ? "Admin" : "Staff"}
              </span>
              <LogoutButton />
            </div>
          )}
        </div>

        {showNav && (
          <>
            <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
              {commonLinks.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                  {link.label}
                </Link>
              ))}
            </div>

            {isAdmin && (
              <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
                {adminLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={linkClass(link.href)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </nav>
  );
}
