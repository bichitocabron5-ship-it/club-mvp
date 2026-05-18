// components/logout-button.tsx
"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="app-button-secondary rounded-full px-4 py-2 text-sm font-semibold"
    >
      Salir
    </button>
  );
}
