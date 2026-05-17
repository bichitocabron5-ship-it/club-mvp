"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

import { LogoutButton } from "@/components/logout-button";

const commonLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/access", label: "Acceso" },
  { href: "/sales", label: "Retiradas" },
  { href: "/members", label: "Socios" },
];

const adminLinks = [
  { href: "/admin/users", label: "Admin" },
  { href: "/cash", label: "Caja" },
  { href: "/expenses", label: "Gastos" },
  { href: "/suppliers", label: "Proveedores" },
  { href: "/purchases", label: "Compras" },
  { href: "/products", label: "Productos" },
  { href: "/stock", label: "Stock" },
];

export function AppNav() {
  const { data: session, status } = useSession();

  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const showNav = status === "authenticated";

  return (
    <nav className="bg-gray-900 p-4 text-white">
      <div className="mx-auto flex max-w-4xl gap-4">
        <Link href="/" className="font-bold">
          Club MVP
        </Link>

        {showNav &&
          commonLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}

        {showNav &&
          isAdmin &&
          adminLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}

        {showNav && <LogoutButton />}
      </div>
    </nav>
  );
}
