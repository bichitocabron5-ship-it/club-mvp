import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

function StatSkeleton() {
  return (
    <div className="app-panel min-w-0 rounded-3xl p-4 md:p-5">
      <LoadingSkeleton className="h-3 w-28 max-w-full" />
      <LoadingSkeleton className="mt-4 h-8 w-32 max-w-full" />
      <LoadingSkeleton className="mt-3 h-7 w-36 max-w-full rounded-2xl" />
    </div>
  );
}

function TabSkeleton({ widthClassName }: { widthClassName: string }) {
  return (
    <LoadingSkeleton
      className={`h-16 min-w-[9rem] shrink-0 rounded-[1.1rem] ${widthClassName}`}
    />
  );
}

function ListItemSkeleton() {
  return (
    <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <LoadingSkeleton className="h-4 w-48 max-w-full" />
          <LoadingSkeleton className="mt-2 h-3 w-56 max-w-full" />
        </div>
        <LoadingSkeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <LoadingSkeleton className="h-14 rounded-2xl" />
        <LoadingSkeleton className="h-14 rounded-2xl" />
      </div>
    </div>
  );
}

export function PanelLoadingSkeleton() {
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando dashboard
      </span>

      <div className="mb-2 md:mb-4">
        <LoadingSkeleton className="h-9 w-64" />
        <LoadingSkeleton className="mt-3 h-4 w-full max-w-2xl" />
        <LoadingSkeleton className="mt-2 h-4 w-4/5 max-w-xl" />
      </div>

      <div className="space-y-5">
        <section className="rounded-[1.5rem] border border-black/8 bg-white/75 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <LoadingSkeleton className="h-4 w-40 max-w-full" />
              <LoadingSkeleton className="mt-2 h-3 w-56 max-w-full" />
            </div>
            <LoadingSkeleton className="h-9 w-full rounded-full sm:w-28" />
          </div>
        </section>

        <div className="flex justify-stretch sm:justify-end">
          <LoadingSkeleton className="h-10 w-full rounded-full sm:w-48" />
        </div>

        <section className="rounded-[1.5rem] border border-black/8 bg-white/75 p-2">
          <div className="flex gap-2 overflow-hidden pb-1">
            <TabSkeleton widthClassName="w-40" />
            <TabSkeleton widthClassName="w-44" />
            <TabSkeleton widthClassName="w-36" />
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
          <LoadingSkeleton className="mt-2 h-4 w-full max-w-lg" />
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <ListItemSkeleton key={index} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
