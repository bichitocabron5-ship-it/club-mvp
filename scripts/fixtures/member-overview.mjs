export function overviewFixture(overrides = {}) {
  return {
    identity: { id: 1, memberNumber: "1", fullName: "Member A", joinedAt: "2026-01-01T00:00:00.000Z" },
    operational: { active: true, expiresAt: null, expired: false, hasContract: true, canWithdraw: true,
      reasons: { inactive: false, noContract: false, expired: false }, hasRfid: true },
    contract: { id: 42, signedAt: "2026-01-01T00:00:00.000Z" },
    consumption: { monthlyGrams: 2.3456789, monthlyLimitG: 25, periodStart: "2026-10-01T00:00:00.000Z", periodEndExclusive: "2026-11-01T00:00:00.000Z" },
    documentation: { hasDniFront: true, hasDniBack: false }, access: { lastEvent: null }, ...overrides,
  };
}
// Adapts existing UI scenarios, retaining the deliberate contradictory server facts.
export function overviewFromOperational(value, id = 1) {
  const base = overviewFixture();
  return { ...base, identity: { ...base.identity, id }, operational: {
    ...base.operational, active: value.member.active, expiresAt: value.member.expiresAt,
    expired: value.expired, hasContract: value.hasContract, canWithdraw: value.canWithdraw ?? true,
  } };
}
