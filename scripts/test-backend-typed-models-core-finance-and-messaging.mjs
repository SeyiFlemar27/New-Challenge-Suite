import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/platform-models.ts", import.meta.url), "utf8");
for (const model of ["NotificationRecord", "ConversationRecord", "MessageRecord", "EarningsTransactionRecord", "PayoutRecord", "PayoutMethodRecord", "DoroCoinTransactionRecord", "DoroCoinPurchasePackage", "AdRewardCycleRecord", "VoteRecord", "DailyFreeVoteEligibilityRecord", "PredictionMarketRecord", "PredictionStakeRecord", "PredictionPoolTotalsRecord", "SettlementRecord", "RefundRecord", "DisputeRecord", "ChallengeLifecycleRecord", "ChallengeCancellationRecord", "CompletedResultsArchiveRecord"]) {
  assert.match(source, new RegExp(`export type ${model}`), `${model} must have a shared typed contract`);
}
for (const category of ["cash", "dorocoin", "vote", "stake", "payout", "fee", "refund"]) assert.ok(source.includes(`"${category}"`));
assert.ok(source.includes("readonly immutable: true"));
assert.ok(source.includes("readonly idempotencyKey: string"));
console.log("Backend typed model checks passed.");
