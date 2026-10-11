import assert from "node:assert/strict";
import { createSponsorReservationWindow, isSponsorPaymentWithinReservation, SPONSOR_FUNDING_RESERVATION_WINDOW_MS } from "../lib/server/sponsor-reservation-policy.ts";
import { validateSponsorFundingWindow } from "../lib/server/payout-structure.ts";

const start = new Date("2026-10-10T10:00:00.000Z");
const window = createSponsorReservationWindow(start);
assert.equal(window.createdAt, start.toISOString());
assert.equal(Date.parse(window.expiresAt) - Date.parse(window.createdAt), 900_000);
assert.equal(SPONSOR_FUNDING_RESERVATION_WINDOW_MS, 900_000);

const base = {
  reservationCreatedAt: window.createdAt,
  reservationExpiresAt: window.expiresAt,
  votingStartsAt: "2026-10-10T10:02:00.000Z",
};
const cases = [
  ["completion before cutoff and expiry", "2026-10-10T10:01:00.000Z", true],
  ["completion after cutoff but before expiry", "2026-10-10T10:08:00.000Z", true],
  ["completion at reservation creation", window.createdAt, true],
  ["completion exactly at expiry", window.expiresAt, false],
  ["completion after expiry", "2026-10-10T10:15:00.001Z", false],
  ["completion before reservation creation", "2026-10-10T09:59:59.999Z", false],
];
for (const [name, paymentCompletedAt, expected] of cases) {
  assert.equal(isSponsorPaymentWithinReservation({ ...base, paymentCompletedAt }), expected, name);
}
assert.equal(isSponsorPaymentWithinReservation({ ...base, paymentCompletedAt: "2026-10-10T10:01:00.000Z", reservationExpiresAt: "2026-10-10T10:15:00.001Z" }), false, "corrupt reservation duration fails closed");
assert.equal(isSponsorPaymentWithinReservation({ ...base, votingStartsAt: "invalid", paymentCompletedAt: "2026-10-10T10:01:00.000Z" }), false, "invalid persisted cutoff fails closed");
assert.equal(isSponsorPaymentWithinReservation({ ...base, votingStartsAt: "2026-10-10T10:00:00.000Z", paymentCompletedAt: "2026-10-10T10:01:00.000Z" }), false, "reservation created exactly at voting cutoff is not eligible");
assert.equal(isSponsorPaymentWithinReservation({ ...base, votingStartsAt: null, paymentCompletedAt: "2026-10-10T10:01:00.000Z" }), true, "no configured cutoff uses the reservation window only");
assert.equal(isSponsorPaymentWithinReservation({ ...base, paymentCompletedAt: "2026-10-10T10:14:58.000Z", paymentTimestampPrecisionMs: 1000 }), true, "second-resolution Stripe event whose full uncertainty interval ends before expiry is eligible");
assert.equal(isSponsorPaymentWithinReservation({ ...base, paymentCompletedAt: "2026-10-10T10:14:59.000Z", paymentTimestampPrecisionMs: 1000 }), false, "second-resolution Stripe event whose uncertainty interval ends exactly at expiry fails closed");
assert.equal(isSponsorPaymentWithinReservation({ ...base, paymentCompletedAt: "2026-10-10T10:14:59.001Z", paymentTimestampPrecisionMs: 1000 }), false, "provider timestamp whose precision overlaps expiry fails closed to review");
const cutoffChallenge = { status: "active", publishedAt: start.toISOString(), sponsorEnabled: true, votingStartsAt: "2026-10-10T10:02:00.000Z" };
assert.equal(validateSponsorFundingWindow(cutoffChallenge, new Date("2026-10-10T10:01:59.999Z")).allowed, true, "new reservation one millisecond before cutoff is permitted");
assert.equal(validateSponsorFundingWindow(cutoffChallenge, new Date("2026-10-10T10:02:00.000Z")).allowed, false, "new reservation exactly at cutoff is rejected");
assert.equal(validateSponsorFundingWindow(cutoffChallenge, new Date("2026-10-10T10:02:00.001Z")).allowed, false, "new reservation after cutoff is rejected");
console.log(`PASS Sponsor reservation policy: ${cases.length + 10} deterministic boundary and integrity assertions.`);
