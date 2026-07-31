import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

function StatSkeleton() {
  return (
    <div className="app-panel rounded-3xl p-4 md:p-5">
      <LoadingSkeleton className="h-3 w-28" />
      <LoadingSkeleton className="mt-4 h-8 w-32" />
    </div>
  );
}

export function PanelLoadingSkeleton() {
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-2 md:mb-4">
        <LoadingSkeleton className="h-9 w-64" />
        <LoadingSkeleton className="mt-3 h-4 w-full max-w-2xl" />
        <LoadingSkeleton className="mt-2 h-4 w-4/5 max-w-xl" />
      </div>

      <div className="space-y-5">
        <section className="rounded-[1.5rem] border border-black/8 bg-white/75 px-4 py-3">
          <LoadingSkeleton className="h-4 w-40" />
          <LoadingSkeleton className="mt-2 h-3 w-56 max-w-full" />
        </section>

        <section className="rounded-[1.5rem] border border-black/8 bg-white/75 p-2">
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 3 }).map((_, index) => (
              <LoadingSkeleton key={index} className="h-16 min-w-36 rounded-[1.1rem]" />
            ))}
          </div>
        </section>

        <div>
          <LoadingSkeleton className="h-6 w-36" />
          <LoadingSkeleton className="mt-2 h-4 w-full max-w-xl" />
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
      </div>
    </main>
  );
}
