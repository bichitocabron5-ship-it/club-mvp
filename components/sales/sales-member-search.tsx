import type { KeyboardEvent } from "react";

import type { MemberSummary } from "@/lib/types";

export function SalesMemberSearch({
  filteredMembers,
  memberId,
  memberRecentSalesError,
  memberRecentSalesLoading,
  memberRecentSummary,
  memberSearch,
  onClearMember,
  onMemberChange,
  onMemberSearchKeyDown,
  onMemberSearchChange,
}: {
  filteredMembers: MemberSummary[];
  memberId: string;
  memberRecentSalesError: string;
  memberRecentSalesLoading: boolean;
  memberRecentSummary: string;
  memberSearch: string;
  onClearMember: () => void;
  onMemberChange: (memberId: string) => void;
  onMemberSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onMemberSearchChange: (value: string) => void;
}) {
  return (
    <div className="app-panel rounded-3xl p-4 space-y-3">
      <label className="block text-sm font-medium">Socio</label>

      <input
        className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        placeholder="Buscar socio por nombre o DNI..."
        value={memberSearch}
        onChange={(event) => onMemberSearchChange(event.target.value)}
        onKeyDown={onMemberSearchKeyDown}
      />

      <select
        className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        value={memberId}
        onChange={(event) => onMemberChange(event.target.value)}
        required
      >
        <option value="">Selecciona socio</option>
        {filteredMembers.map((member) => (
          <option key={member.id} value={member.id}>
            {member.fullName} {member.dni ? `· ${member.dni}` : ""}
          </option>
        ))}
      </select>

      {memberId && (
        <div className="flex items-center gap-2">
          <p
            className={`min-w-0 flex-1 truncate text-xs font-medium ${
              memberRecentSalesError ? "text-red-700" : "app-muted"
            }`}
            title={
              memberRecentSalesError
                ? memberRecentSalesError
                : memberRecentSalesLoading
                  ? "Cargando retiradas..."
                  : memberRecentSummary
            }
          >
            {memberRecentSalesError
              ? "Error cargando retiradas"
              : memberRecentSalesLoading
                ? "Cargando retiradas..."
                : memberRecentSummary}
          </p>

          <button
            type="button"
            onClick={onClearMember}
            className="app-button-secondary shrink-0 rounded-full px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
          >
            Cambiar socio
          </button>
        </div>
      )}
    </div>
  );
}
