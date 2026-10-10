import { z } from "zod";
import type { MemberOverviewDTO } from "@/lib/dtos/member-overview";

const date = z.string().datetime({ offset: true });
const schema = z.object({
  identity: z.object({ id: z.number().int(), memberNumber: z.string().nullable(), fullName: z.string(), joinedAt: date }),
  operational: z.object({ active: z.boolean(), expiresAt: date.nullable(), expired: z.boolean(), hasContract: z.boolean(), canWithdraw: z.boolean(),
    reasons: z.object({ inactive: z.boolean(), noContract: z.boolean(), expired: z.boolean() }), hasRfid: z.boolean() }),
  contract: z.object({ id: z.number().int(), signedAt: date }).nullable(),
  consumption: z.object({ monthlyGrams: z.number(), monthlyLimitG: z.number().nullable(), periodStart: date, periodEndExclusive: date }),
  documentation: z.object({ hasDniFront: z.boolean(), hasDniBack: z.boolean() }),
  access: z.object({ lastEvent: z.object({ type: z.string(), createdAt: date }).nullable() }),
});

export type OverviewState = { snapshot: MemberOverviewDTO | null; loading: boolean; error: string };

// One owner per mounted member. Mutations supersede in-flight reads; retries share them.
export function createMemberOverviewLoader(id: string, publish: (state: OverviewState) => void) {
  let version = 0;
  let pending: Promise<boolean> | null = null;
  let disposed = false;
  return {
    activate() { disposed = false; },
    refresh(force = false): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (pending && !force) return pending;
      const requestVersion = ++version;
      publish({ snapshot: null, loading: true, error: "" });
      pending = (async () => {
        try {
          const response = await fetch(`/api/members/${id}/overview`, { cache: "no-store" });
          if (!response.ok) throw new Error("Overview unavailable");
          const body: unknown = response.status === 204 ? null : await response.json();
          const snapshot = body === null ? null : schema.parse(body);
          if (snapshot && String(snapshot.identity.id) !== id) throw new Error("Wrong member");
          if (requestVersion !== version) return false;
          publish({ snapshot, loading: false, error: "" });
          return true;
        } catch {
          if (requestVersion === version) publish({ snapshot: null, loading: false,
            error: "No se pudo actualizar el resumen operativo. Reintenta la consulta." });
          return false;
        } finally {
          if (requestVersion === version) pending = null;
        }
      })();
      return pending;
    },
    dispose() { disposed = true; version++; pending = null; },
  };
}
