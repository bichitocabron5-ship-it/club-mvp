export function normalizeTaskOptionalText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

export function getTaskActorUserId(userId: string | undefined) {
  const actorUserId = Number(userId);
  return Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null;
}
