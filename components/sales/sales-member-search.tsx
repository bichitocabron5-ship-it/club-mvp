import type { FocusEvent, KeyboardEvent } from "react";

import type { MemberSummary } from "@/lib/types";

export function SalesMemberSearch({
  disabled,
  filteredMembers,
  memberId,
  memberRecentSalesError,
  memberRecentSalesLoading,
  memberRecentSummary,
  memberSearch,
  selectedMember,
  onClearMember,
  onMemberChange,
  onMemberSearchBlur,
  onMemberSearchKeyDown,
  onMemberSearchChange,
}: {
  disabled: boolean;
  filteredMembers: MemberSummary[];
  memberId: string;
  memberRecentSalesError: string;
  memberRecentSalesLoading: boolean;
  memberRecentSummary: string;
  memberSearch: string;
  selectedMember: MemberSummary | null;
  onClearMember: () => void;
  onMemberChange: (memberId: string) => void;
  onMemberSearchBlur: () => void;
  onMemberSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onMemberSearchChange: (value: string) => void;
}) {
  const normalizedMemberId = memberId.trim();
  const selectedMemberLabel = selectedMember
    ? selectedMember.fullName
    : normalizedMemberId
      ? `Socio #${normalizedMemberId}`
      : "";
  const selectedMemberMeta = selectedMember
    ? [
        selectedMember.memberNumber
          ? `Socio ${selectedMember.memberNumber}`
          : `Socio ${selectedMember.id}`,
        selectedMember.dni ? `DNI ${selectedMember.dni}` : "",
      ]
        .filter(Boolean)
        .join(" - ")
    : "";
  const selectedMemberIsInResults = filteredMembers.some(
    (member) => String(member.id) === normalizedMemberId
  );
  const isSearchingReplacement =
    Boolean(normalizedMemberId) &&
    Boolean(memberSearch.trim()) &&
    memberSearch.trim() !== selectedMemberLabel.trim();
  const selectedMemberStatusId = "sales-member-selected-status";
  const replacementStatusId = "sales-member-replacement-status";
  const memberSearchDescription = normalizedMemberId
    ? isSearchingReplacement
      ? `${selectedMemberStatusId} ${replacementStatusId}`
      : selectedMemberStatusId
    : undefined;

  function handlePanelBlur(event: FocusEvent<HTMLDivElement>) {
    const panel = event.currentTarget;

    window.setTimeout(() => {
      if (panel.contains(document.activeElement)) return;

      onMemberSearchBlur();
    }, 0);
  }

  return (
    <div className="app-panel rounded-3xl p-4 space-y-3" onBlur={handlePanelBlur}>
      <label htmlFor="sales-member-search" className="block text-sm font-medium">
        Socio
      </label>

      {normalizedMemberId && (
        <div
          id={selectedMemberStatusId}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-emerald-700">
            Socio seleccionado
          </div>
          <div className="mt-0.5 truncate font-semibold text-emerald-950">
            {selectedMemberLabel}
          </div>
          {selectedMemberMeta && (
            <div className="mt-0.5 truncate text-xs font-medium text-emerald-800">
              {selectedMemberMeta}
            </div>
          )}
        </div>
      )}

      <input
        id="sales-member-search"
        className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-black/50"
        placeholder="Buscar socio por nombre o DNI..."
        value={memberSearch}
        onChange={(event) => onMemberSearchChange(event.target.value)}
        onKeyDown={onMemberSearchKeyDown}
        aria-describedby={memberSearchDescription}
        disabled={disabled}
      />

      {isSearchingReplacement && (
        <p
          id={replacementStatusId}
          className="text-xs font-medium text-amber-700"
        >
          Buscando reemplazo: el socio activo sigue siendo {selectedMemberLabel}.
        </p>
      )}

      <select
        id="sales-member-select"
        className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-black/50"
        value={memberId}
        onChange={(event) => onMemberChange(event.target.value)}
        aria-label="Seleccionar socio"
        required
        disabled={disabled}
      >
        <option value="">Selecciona socio</option>
        {normalizedMemberId && !selectedMemberIsInResults && (
          <option value={normalizedMemberId}>
            Actual: {selectedMemberLabel}
            {selectedMember?.dni ? ` - ${selectedMember.dni}` : ""}
          </option>
        )}
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
            disabled={disabled}
            className="app-button-secondary shrink-0 rounded-full px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cambiar socio
          </button>
        </div>
      )}
    </div>
  );
}
