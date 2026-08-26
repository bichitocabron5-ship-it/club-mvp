import {
  formatCurrency,
  formatDateTime,
  formatPaymentMethodLabel,
  formatSourceLabel,
} from "@/lib/helpers/cash-formatters";
import type { CashMove } from "@/lib/types";

export function CashMovementsTable({
  todayMoves,
  groupedMoves,
  orderedGroups,
}: {
  todayMoves: CashMove[];
  groupedMoves: Record<string, CashMove[]>;
  orderedGroups: string[];
}) {
  return (
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                Trazabilidad
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Movimientos de caja
            </h2>

            <p className="mt-1 text-sm app-muted">
              Entradas y salidas registradas durante la jornada.
            </p>
          </div>

          <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
            {todayMoves.length} movimiento
            {todayMoves.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {todayMoves.length === 0 ? (
          <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
            <div className="font-black text-[#201f1d]">
              Sin movimientos de caja
            </div>

            <p className="mt-2 text-sm app-muted">
              Las entradas y salidas registradas hoy aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {orderedGroups.map((source) => {
              const sourceMoves = groupedMoves[source];

              if (!sourceMoves?.length) {
                return null;
              }

              return (
                <section key={source}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-[2px] w-5 rounded-full bg-[#a7282d]" />

                    <h3 className="text-sm font-black uppercase tracking-[0.12em] text-[#645b4c]">
                      {formatSourceLabel(source)}
                    </h3>

                    <span className="ml-auto rounded-full bg-[#f3f0e9] px-2.5 py-1 text-xs font-bold text-[#6d6860]">
                      {sourceMoves.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {sourceMoves.map((move) => {
                      const isIncome = move.type === "income";

                      return (
                        <article
                          key={move.id}
                          className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 transition-all hover:border-[#b4a78d]/40 hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)]"
                        >
                          <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold app-muted">
                                {formatDateTime(move.createdAt)}
                              </div>

                              <div className="mt-1 break-words font-black text-[#201f1d]">
                                {move.note || "Sin nota"}
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full border border-[#b4a78d]/25 bg-[#f7f4ee] px-3 py-1 font-bold text-[#645b4c]">
                                  {formatPaymentMethodLabel(move.paymentMethod)}
                                </span>

                                {move.createdByUser?.name ? (
                                  <span className="rounded-full border border-black/8 bg-white px-3 py-1 font-semibold app-muted">
                                    {move.createdByUser.name}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="shrink-0 md:text-right">
                              <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                                {isIncome ? "Entrada" : "Salida"}
                              </div>

                              <div
                                className={`mt-1 text-2xl font-black tracking-[-0.03em] ${
                                  isIncome
                                    ? "text-emerald-700"
                                    : "text-red-700"
                                }`}
                              >
                                {isIncome ? "+" : "-"}
                                {formatCurrency(Number(move.amount))}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
