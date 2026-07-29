import { assert, read, settlement } from "./settlement-test-utils.mjs";
const payments = read("lib/server/monetization-payments.ts");
const source = settlement();
assert(source.includes("getConfirmedEntryRevenueForChallenge") && source.includes("getConfirmedPaidVoteRevenueForChallenge") && source.includes("getConfirmedSponsorContributionForChallenge"), "settlement must call confirmed payment aggregators");
assert(payments.includes("item.webhookConfirmed === true") && payments.includes('["paid", "confirmed"].includes(String(item.status))'), "aggregators must require webhook/provider confirmation");
assert(source.includes("pendingFailedCancelledExcluded: true"), "settlement must exclude unconfirmed states");
console.log("confirmed revenue only checks passed");
