import type { FormEvent, RefObject } from "react";

export function SalesRfidInput({
  rfidError,
  rfidInput,
  rfidRef,
  onFocusRfid,
  onRfidInputChange,
  onSubmit,
}: {
  rfidError: string;
  rfidInput: string;
  rfidRef: RefObject<HTMLInputElement | null>;
  onFocusRfid: () => void;
  onRfidInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="app-panel mb-4 space-y-2 rounded-3xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-sm font-medium">Escanear chapita</label>

        <button
          type="button"
          onClick={onFocusRfid}
          className="app-button-secondary rounded-full px-3 py-2 text-sm font-semibold"
        >
          Enfocar RFID
        </button>
      </div>

      <input
        className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base"
        placeholder="Pasa la chapita por el lector..."
        value={rfidInput}
        onChange={(event) => onRfidInputChange(event.target.value)}
        autoComplete="off"
        ref={rfidRef}
        autoFocus
      />

      {rfidError && (
        <div className="rounded-2xl bg-red-100 p-2 text-sm text-red-700">
          {rfidError}
        </div>
      )}
    </form>
  );
}
