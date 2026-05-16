export const SIGNING_SESSION_TTL_HOURS = 24;

export function getSigningSessionExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SIGNING_SESSION_TTL_HOURS);
  return expiresAt;
}

export function isSigningSessionExpired(expiresAt: Date | string) {
  return new Date(expiresAt) <= new Date();
}
