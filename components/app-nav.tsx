"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";

const commonLinks = [
  { href: "/", label: "Panel" },
  { href: "/access", label: "Acceso" },
  { href: "/tasks", label: "Tareas" },
  { href: "/sales", label: "Retiradas" },
  { href: "/members", label: "Socios" },
  { href: "/products", label: "Productos" },
];

const adminLinks = [
  { href: "/admin/users", label: "Administrador" },
  { href: "/admin/audit", label: "Auditoría" },
  { href: "/cash", label: "Caja" },
  { href: "/expenses", label: "Gastos" },
  { href: "/suppliers", label: "Proveedores" },
  { href: "/purchases", label: "Compras" },
  { href: "/stock", label: "Stock" },
  { href: "/stock/counts", label: "Conteos" },
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
        ? "bg-[#a7282d] text-white shadow-[0_8px_22px_rgba(167,40,45,0.28)]"
        : "text-white/72 hover:bg-white/8 hover:text-white",
    ].join(" ");
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-[#a7282d]/30 bg-[#0b0b0c]/95 text-white backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black">
              <Image
                src="/brand/zen-wolves-logo.png"
                alt="The Zen Wolves"
                fill
                priority
                className="object-contain"
                sizes="48px"
              />
            </div>

            <div className="leading-tight">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#b4a78d]">
                  The
                </span>

                <span className="text-lg font-black tracking-[0.08em] text-[#c43136]">
                  Zen
                </span>

                <span className="text-lg font-black tracking-[0.08em] text-white">
                  Wolves
                </span>
              </div>

              <div className="mt-1 text-xs font-medium tracking-[0.14em] text-white/45">
                Club Social · Gestión
              </div>
            </div>
          </Link>

          {showNav && (
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#b4a78d]">
                {isAdmin ? "Administrador" : "Personal"}
              </span>

              <LogoutButton />
            </div>
          )}
        </div>

        {showNav && (
          <>
            <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
              {commonLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClass(link.href)}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {isAdmin && (
              <div className="-mx-1 flex gap-2 overflow-x-auto border-t border-white/8 pt-3 pb-1">
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

      <div className="h-[2px] bg-gradient-to-r from-transparent via-[#a7282d] to-transparent opacity-80" />
    </nav>
  );
}