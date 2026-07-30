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
    <>
      <h2 className="mb-2 font-semibold">Movimientos de hoy</h2>

      <div className="space-y-4">
        {orderedGroups.map((source) => {
          const sourceMoves = groupedMoves[source];

          if (!sourceMoves?.length) {
            return null;
          }

          return (
            <section key={source} className="space-y-3">
              <div className="text-sm font-semibold text-gray-700">
                {formatSourceLabel(source)}
              </div>

              {sourceMoves.map((move) => (
                <div
                  key={move.id}
                  className="app-panel flex flex-col gap-3 rounded-3xl p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm text-gray-600">
                      {formatDateTime(move.createdAt)}
                    </div>
                    <div>{move.note || "Sin nota"}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatPaymentMethodLabel(move.paymentMethod)}
                      {move.createdByUser?.name
                        ? ` - ${move.createdByUser.name}`
                        : ""}
                    </div>
                  </div>

                  <div
                    className={
                      move.type === "income" ? "text-green-600" : "text-red-600"
                    }
                  >
                    {move.type === "income" ? "+" : "-"}
                    {formatCurrency(Number(move.amount))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}

        {todayMoves.length === 0 ? (
          <div className="app-panel rounded-3xl p-4 text-sm text-gray-500">
            No hay movimientos de caja hoy.
          </div>
        ) : null}
      </div>
    </>
  );
}
