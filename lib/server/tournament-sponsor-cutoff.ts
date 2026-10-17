import { isSponsorPaymentWithinReservation } from "./sponsor-reservation-policy";

/** Read from the authoritative Tournament document inside the credit transaction. */
export function tournamentSponsorCutoff(tournament: Record<string, unknown>): number | null {
  const values = [tournament.firstVotingOpenedAt, tournament.tournamentVotingCutoffAt]
    .filter((value) => value != null);
  if (!values.length) return null;
  const parsed = values.map((value) => Date.parse(String(value)));
  // Conflicting or malformed persisted financial cutoffs require investigation.
  if (parsed.some((value) => !Number.isFinite(value)) || parsed.some((value) => value !== parsed[0])) return NaN;
  return parsed[0];
}

export function isTournamentSponsorPaymentTimely(input: {
  tournament: Record<string, unknown>;
  reservationCreatedAt: unknown;
  reservationExpiresAt: unknown;
  providerCompletionUpperBoundAt: unknown;
  providerTimestampPrecisionMs: number;
  observedAt: Date;
}): boolean {
  const cutoff = tournamentSponsorCutoff(input.tournament);
  const observed = input.observedAt.getTime();
  const upper = Date.parse(String(input.providerCompletionUpperBoundAt ?? ""));
  const precision = input.providerTimestampPrecisionMs;
  if (!Number.isFinite(observed) || !Number.isFinite(upper)
    || !Number.isSafeInteger(precision) || precision < 0 || upper + precision > observed) return false;
  if (cutoff !== null && (!Number.isFinite(cutoff) || cutoff > observed)) return false;
  return isSponsorPaymentWithinReservation({
    reservationCreatedAt: input.reservationCreatedAt,
    reservationExpiresAt: input.reservationExpiresAt,
    paymentCompletedAt: input.providerCompletionUpperBoundAt,
    paymentTimestampPrecisionMs: precision,
    votingStartsAt: cutoff === null ? null : new Date(cutoff),
    requireCompletionBeforeVoting: cutoff !== null,
  });
}
