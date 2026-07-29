import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export { assert };
export const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
export const settlement = () => read("lib/server/challenge-settlement.ts");
export const approval = () => read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");

export function splitChallengeRevenue(gross) {
  const winner = Math.floor(gross * 0.65);
  const creator = Math.floor(gross * 0.20);
  return { winner, creator, platform: gross - winner - creator };
}

export function splitSponsorPrize(gross) {
  const fee = Math.floor(gross * 0.15);
  return { gross, fee, net: gross - fee };
}

export function assertNoExternalExecution(source = settlement()) {
  for (const unsafe of ["stripe.transfers.create", "payouts.create(", "paypal.payout", "bankTransfer(", "automaticRefund: true"]) {
    assert(!source.includes(unsafe), `settlement must not contain external execution: ${unsafe}`);
  }
  assert(source.includes("externalPayoutExecuted: false"), "settlement must explicitly disable external payouts");
}
