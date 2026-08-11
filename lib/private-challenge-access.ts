const PRIVATE_ACCESS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePrivateChallengeAccessCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PRIVATE_ACCESS_ALPHABET[value % PRIVATE_ACCESS_ALPHABET.length]).join("");
}

export function isValidPrivateChallengeAccessCode(value: unknown) {
  return typeof value === "string" && /^[A-HJ-NP-Z2-9]{5}$/.test(value);
}
