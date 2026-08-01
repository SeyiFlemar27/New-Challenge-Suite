import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shared = readFileSync("components/payment-status-journey.tsx", "utf8");
const status = readFileSync("app/api/payments/status/route.ts", "utf8");
const successPages = [
  "app/checkout/subscription/success/page.tsx",
  "app/checkout/dorocoins/success/page.tsx",
  "app/challenges/[id]/registration-success/page.tsx",
  "app/challenges/[id]/paid-votes/success/page.tsx",
  "app/sponsor/funding/[challengeId]/success/page.tsx"
].map((file) => readFileSync(file, "utf8")).join("\n");

assert(shared.includes("/api/payments/status"), "success journeys must query a server status endpoint");
assert(shared.includes("status?.state === \"confirmed\" && status.webhookConfirmed"), "confirmed UI requires backend webhook confirmation");
for (const forbidden of ["setDoc(", "updateDoc(", "applyDoroCoinTransaction", "createPendingEntryPayment", "confirmPaidVotePurchase", "confirmSponsorContribution"]) {
  assert(!successPages.includes(forbidden), `success pages must not activate financial state via ${forbidden}`);
}
assert(status.includes("requireRequestUser"), "payment status must be authenticated");
console.log("client success activation safety checks passed");
