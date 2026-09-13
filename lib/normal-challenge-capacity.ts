export const NORMAL_CHALLENGE_CAPACITY_ERROR =
  "Set capacity to at least 2, or leave it blank for no fixed capacity.";

export type CapacityMode = "unlimited" | "limited";

function isLegacyUnlimitedCapacity(value: unknown) {
  return value === "" || value === null || value === undefined || value === 0 || value === "0";
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

export function inferCapacityMode(value: unknown): CapacityMode {
  return isLegacyUnlimitedCapacity(value) ? "unlimited" : "limited";
}

export function normalizeNormalChallengeCapacity(value: unknown, mode: CapacityMode = inferCapacityMode(value)) {
  return validateCapacity(mode, mode === "unlimited" ? null : value as string | number | null | undefined);
}

export function normalChallengeCapacityError(value: unknown, mode: CapacityMode = inferCapacityMode(value)) {
  try {
    normalizeNormalChallengeCapacity(value, mode);
    return null;
  } catch {
    return NORMAL_CHALLENGE_CAPACITY_ERROR;
  }
}
