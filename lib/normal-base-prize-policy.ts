/** Normal V3 commitments are USD cents; zero creates no funding obligation. */
export function normalBasePrizeCents(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents)
    || Math.abs(amount * 100 - cents) > 0.000001
    || (cents > 0 && cents < 500)) return null;
  return cents;
}
