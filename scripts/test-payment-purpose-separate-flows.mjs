import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const registry = readFileSync("lib/payment-purposes.ts", "utf8");
for (const purpose of ["subscription_payment","dorocoin_purchase","challenge_entry_payment","prize_pool_funding","sponsor_contribution","vote_purchase","challenge_boost_purchase","platform_prize_funding"]) {
  assert(registry.includes(`"${purpose}"`), `missing typed payment purpose: ${purpose}`);
}
for (const page of [
  "app/checkout/subscription/success/route.ts",
  "app/checkout/dorocoins/success/page.tsx",
  "app/challenges/[id]/registration-success/page.tsx",
  "app/challenges/[id]/paid-votes/success/page.tsx",
  "app/sponsor/funding/[challengeId]/success/page.tsx"
]) assert(existsSync(page), `missing purpose-specific payment page: ${page}`);

const entry = readFileSync("app/api/challenges/[id]/entry-checkout/route.ts", "utf8");
const votes = readFileSync("app/api/challenges/[id]/paid-votes/checkout/route.ts", "utf8");
const sponsor = readFileSync("app/api/sponsor/challenges/[id]/funding-checkout/route.ts", "utf8");
assert(entry.includes("/registration-success?entryPaymentId="), "paid entry checkout must use its registration success route");
assert(votes.includes("/paid-votes/success?votePurchaseId="), "paid votes must use their own success route");
assert(sponsor.includes("/sponsor/funding/") && sponsor.includes("/success?sponsorContributionId="), "sponsor funding must use its own success route");
console.log("purpose-specific payment flow checks passed");
