import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { CatalogLogin } from "@/components/catalog/catalog-login";
import {
  CATALOG_SESSION_COOKIE,
  hasCatalogPasswordConfigured,
  isCatalogSessionValid,
} from "@/lib/catalog-session";
import { cookies } from "next/headers";

export default async function CatalogPage() {
  const configured = hasCatalogPasswordConfigured();

  if (!configured) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl items-center px-4 py-8 md:px-6">
        <section className="app-panel-strong w-full rounded-[2rem] p-6 md:p-10">
          <div className="mb-3 inline-flex rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-red-700">
            Configuración pendiente
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">
            Falta `CATALOG_PASSWORD`
          </h1>
          <p className="mt-3 text-base text-[#556156]">
            Define la variable de entorno para habilitar el acceso independiente al modo kiosko.
          </p>
        </section>
      </main>
    );
  }

  const cookieStore = await cookies();
  const hasSession = isCatalogSessionValid(
    cookieStore.get(CATALOG_SESSION_COOKIE)?.value
  );

  return hasSession ? <CatalogBrowser /> : <CatalogLogin />;
}
