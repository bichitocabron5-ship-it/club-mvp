"use client";

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] Route segment render failed", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <section className="app-panel-strong rounded-[2rem] p-5 md:p-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-black tracking-tight">
            No se pudo mostrar esta vista
          </h1>
          <p className="mt-2 text-sm leading-6 app-muted">
            Ha ocurrido un error temporal renderizando la pagina.
          </p>
        </div>

        <button
          type="button"
          onClick={() => unstable_retry()}
          className="app-button-primary mt-5 rounded-full px-4 py-2 text-sm font-bold"
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
