export const SPONSOR_FUNDING_RESERVATION_WINDOW_MS = 15 * 60 * 1000;

export type SponsorReservationWindow = {
  createdAt: string;
  expiresAt: string;
};

export function createSponsorReservationWindow(createdAt: Date): SponsorReservationWindow {
  const created = createdAt.getTime();
  if (!Number.isFinite(created)) throw new Error("Sponsor reservation creation time is invalid.");
  return {
    createdAt: new Date(created).toISOString(),
    expiresAt: new Date(created + SPONSOR_FUNDING_RESERVATION_WINDOW_MS).toISOString(),
  };
}

export function isSponsorPaymentWithinReservation(input: {
  reservationCreatedAt: unknown;
  reservationExpiresAt: unknown;
  paymentCompletedAt: unknown;
  paymentTimestampPrecisionMs?: number;
  votingStartsAt: unknown;
}): boolean {
  const created = Date.parse(String(input.reservationCreatedAt ?? ""));
  const expires = Date.parse(String(input.reservationExpiresAt ?? ""));
  const completed = input.paymentCompletedAt instanceof Date
    ? input.paymentCompletedAt.getTime()
    : Date.parse(String(input.paymentCompletedAt ?? ""));
  const votingStarts = input.votingStartsAt == null
    ? null
    : input.votingStartsAt instanceof Date
      ? input.votingStartsAt.getTime()
      : Date.parse(String(input.votingStartsAt));

  if (![created, expires, completed].every(Number.isFinite)) return false;
  if (expires !== created + SPONSOR_FUNDING_RESERVATION_WINDOW_MS) return false;
  const precision = Number.isSafeInteger(input.paymentTimestampPrecisionMs) && Number(input.paymentTimestampPrecisionMs) >= 0
    ? Number(input.paymentTimestampPrecisionMs)
    : 0;
  // Provider timestamps with coarse precision represent an uncertainty interval.
  // Require the entire interval to end strictly before expiry; equality is not
  // proof that payment completed before the reservation expired.
  if (completed < created || completed >= expires || (precision > 0 && completed + precision >= expires)) return false;
  return votingStarts === null || (Number.isFinite(votingStarts) && created < votingStarts);
}
