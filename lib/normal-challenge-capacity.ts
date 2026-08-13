export const NORMAL_CHALLENGE_MAX_PARTICIPANTS = 50;

export const NORMAL_CHALLENGE_CAPACITY_ERROR =
  "Set capacity to at least 2, or leave it blank for no fixed capacity.";

export function normalizeNormalChallengeCapacity(value: unknown) {
  if (value === "" || value === undefined) return 0;
  if (value === null) return Number.NaN;
  return Number(value);
}

export function normalChallengeCapacityError(value: unknown) {
  const capacity = normalizeNormalChallengeCapacity(value);
  if (
    !Number.isFinite(capacity) ||
    !Number.isInteger(capacity) ||
    capacity < 0 ||
    capacity === 1 ||
    capacity > NORMAL_CHALLENGE_MAX_PARTICIPANTS
  ) {
    return NORMAL_CHALLENGE_CAPACITY_ERROR;
  }
  return null;
}
