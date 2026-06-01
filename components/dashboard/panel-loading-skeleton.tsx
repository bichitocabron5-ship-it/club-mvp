import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

function StatSkeleton() {
  return (
    <div className="app-panel rounded-3xl p-4 md:p-5">
      <LoadingSkeleton className="h-3 w-28" />
      <LoadingSkeleton className="mt-4 h-8 w-32" />
    </div>
  );
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section className="app-panel rounded-[2rem] p-5">
      <LoadingSkeleton className="h-5 w-44" />
      <LoadingSkeleton className="mt-3 h-4 w-64 max-w-full" />

      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.25rem] border border-black/8 bg-white/60 p-4"
          >
            <LoadingSkeleton className="h-4 w-2/3" />
            <LoadingSkeleton className="mt-3 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function PanelLoadingSkeleton() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="mb-2 md:mb-4">
        <LoadingSkeleton className="h-9 w-64" />
        <LoadingSkeleton className="mt-3 h-4 w-full max-w-2xl" />
        <LoadingSkeleton className="mt-2 h-4 w-4/5 max-w-xl" />
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <StatSkeleton key={index} />
        ))}
      </section>

      <section className="app-panel-strong rounded-[2rem] p-5">
        <LoadingSkeleton className="h-5 w-40" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <LoadingSkeleton key={index} className="h-20 rounded-[1.5rem]" />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={4} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <PanelSkeleton rows={3} />
        <PanelSkeleton rows={3} />
      </section>
    </main>
  );
}
