export interface MemberOverviewDTO {
  identity: {
    id: number;
    memberNumber: string | null;
    fullName: string;
    joinedAt: string;
  };
  operational: {
    active: boolean;
    expiresAt: string | null;
    expired: boolean;
    hasContract: boolean;
    canWithdraw: boolean;
    reasons: {
      inactive: boolean;
      noContract: boolean;
      expired: boolean;
    };
    hasRfid: boolean;
  };
  contract: {
    id: number;
    signedAt: string;
  } | null;
  consumption: {
    monthlyGrams: number;
    monthlyLimitG: number | null;
    periodStart: string;
    periodEndExclusive: string;
  };
  documentation: {
    hasDniFront: boolean;
    hasDniBack: boolean;
  };
  access: {
    lastEvent: {
      type: string;
      createdAt: string;
    } | null;
  };
}
