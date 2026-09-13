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

export function parseOptionalCapacity(value: string | number | null | undefined): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const capacity = Number(value);
  if (!Number.isFinite(capacity)) throw new Error("Capacity must be a valid number.");
  if (!Number.isInteger(capacity)) throw new Error("Capacity must be a whole number.");
  if (capacity < 2) throw new Error("Capacity must be at least 2.");
  return capacity;
}

export function validateCapacity(mode: "unlimited" | "limited", value: string | number | null | undefined): number | null {
  if (mode === "unlimited") return null;
  const capacity = parseOptionalCapacity(value);
  if (capacity === null) throw new Error("Enter a participant capacity.");
  return capacity;
}
