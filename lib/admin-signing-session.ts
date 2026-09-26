export type AdminSigningSession = {
  id: number;
  status: "PENDING" | "EXPIRED" | "CANCELLED" | "SIGNED";
  expiresAt: string;
  signUrl: string | null;
  documentUrl: string | null;
  contractPdfUrl: string | null;
};
export type SigningState = { session: AdminSigningSession | null; busy: boolean; error: string; ready: boolean };

export function normalizeSession(session: AdminSigningSession | null, now = Date.now()): AdminSigningSession | null {
  if (!session) return null;
  const status = session.status === "PENDING" && Date.parse(session.expiresAt) <= now ? "EXPIRED" : session.status;
  return { ...session, status, signUrl: status === "PENDING" ? session.signUrl : null,
    documentUrl: status === "PENDING" ? session.documentUrl : null };
}

// One controller per mounted member. Epochs invalidate reads before any mutation.
export function createSigningController(memberId: number, notify: (state: SigningState) => void,
  transport: typeof fetch = fetch, clock = { now: Date.now, setTimeout, clearTimeout }) {
  let state: SigningState = { session: null, busy: false, error: "", ready: false };
  let epoch = 0, disposed = false, locked = false;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const base = `/api/members/${memberId}/signing-sessions`;
  const emit = () => { if (!disposed) notify({ ...state }); };
  const clear = () => { clock.clearTimeout(poll); clock.clearTimeout(expiry); };
  const apply = (session: AdminSigningSession | null) => {
    clear();
    state = { ...state, session: normalizeSession(session, clock.now()), ready: true };
    emit();
    if (state.session?.status === "PENDING") {
      poll = clock.setTimeout(() => { void recover(); }, 2000);
      expiry = clock.setTimeout(() => {
        epoch++; clear(); state.session = normalizeSession(state.session, clock.now()); emit();
      }, Math.max(0, Date.parse(state.session.expiresAt) - clock.now()));
    }
  };
  async function read(version: number) {
    const res = await transport(base, { cache: "no-store" });
    if (disposed || version !== epoch) return;
    if (res.status === 410) {
      apply(state.session ? { ...state.session, status: "EXPIRED", signUrl: null } : null); return;
    }
    if (!res.ok) throw new Error("No se pudo recuperar la sesiÃ³n. Actualiza el estado antes de continuar.");
    const data = await res.json();
    if (!disposed && version === epoch) apply(data.session);
  }
  async function recover() {
    if (disposed || locked) return;
    const version = ++epoch;
    clock.clearTimeout(poll); state.error = "";
    try { await read(version); }
    catch (error) { if (!disposed && version === epoch) fail(error); }
  }
  function fail(error: unknown) {
    clear(); state = { ...state, ready: false, error: error instanceof Error ? error.message : "No se pudo confirmar la operaciÃ³n" };
    // Fail closed: links must not remain usable after a terminal read error.
    if (state.session) state.session = { ...state.session, signUrl: null, documentUrl: null };
    emit();
  }
  async function mutate(action: "create" | "cancel") {
    if (disposed || locked || !state.ready) return;
    const current = normalizeSession(state.session, clock.now());
    if (action === "cancel" && current?.status !== "PENDING") return;
    locked = true;
    const version = ++epoch;
    clear(); state = { ...state, busy: true, error: "", session: current ? { ...current, signUrl: null, documentUrl: null } : null }; emit();
    try {
      const res = await transport(action === "create" ? "/api/signing-sessions" : `${base}/${current!.id}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        ...(action === "create" ? { body: JSON.stringify({ memberId }) } : {}),
      });
      if (disposed || version !== epoch) return;
      if (!res.ok) {
        if (res.status === 410 && current) { apply({ ...current, status: "EXPIRED", signUrl: null }); return; }
        throw new Error("No se pudo confirmar la operaciÃ³n. Actualiza el estado antes de intentarlo de nuevo.");
      }
      // Always recover authoritative state, including a concurrent signature/reissue.
      await read(version);
    } catch (error) { if (!disposed && version === epoch) fail(error); }
    finally { locked = false; if (!disposed) { state.busy = false; emit(); } }
  }
  return { recover, mutate, dispose() { disposed = true; epoch++; clear(); } };
}
