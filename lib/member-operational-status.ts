export type OperationalMemberInput = {
  active: boolean;
  expiresAt: Date | null;
  rfidCode: string | null;
};

export type OperationalContractInput = {
  id: number;
  consumptionGrams: number | null;
};

export type MemberOperationalFacts = {
  active: boolean;
  expiresAt: Date | null;
  expired: boolean;
  hasContract: boolean;
  currentContractId: number | null;
  monthlyLimitG: number | null;
  hasRfid: boolean;
};

// Basic eligibility only; sales/access must still enforce their own restrictions.
export function composeMemberOperationalStatus(facts: MemberOperationalFacts) {
  return {
    expired: facts.expired,
    hasContract: facts.hasContract,
    canWithdraw: facts.active && !facts.expired && facts.hasContract,
    reasons: {
      inactive: !facts.active,
      noContract: !facts.hasContract,
      expired: facts.expired,
    },
  };
}

/**
 * currentContract is selected by the caller's policy, not proof of legal validity.
 * Dates must be valid: Invalid Date yields NaN and would make expiry compare false.
 */
export function getMemberOperationalFacts(
  member: OperationalMemberInput,
  currentContract: OperationalContractInput | null,
  now: Date,
): MemberOperationalFacts {
  return {
    active: member.active,
    expiresAt: member.expiresAt,
    expired: member.expiresAt !== null && member.expiresAt.getTime() < now.getTime(),
    hasContract: currentContract !== null,
    currentContractId: currentContract === null ? null : currentContract.id,
    monthlyLimitG: currentContract === null ? null : currentContract.consumptionGrams,
    // Assignment presence only; this does not validate presented RFID evidence.
    hasRfid: Boolean(member.rfidCode),
  };
}
