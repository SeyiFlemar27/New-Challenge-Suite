import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const checkoutRoute = read("app/api/challenges/[id]/paid-votes/checkout/route.ts");
const statusRoute = read("app/api/challenges/[id]/paid-votes/status/route.ts");
const votesPage = read("app/challenges/[id]/votes/page.tsx");
const bonusVotesPage = read("app/challenges/[id]/bonus-votes/page.tsx");
const webhook = read("app/api/stripe/webhook/route.ts");
const helper = read("lib/server/monetization-payments.ts");
const voteRoute = read("app/api/votes/route.ts");
const votingHelper = read("lib/server/voting.ts");

assert(exists("app/api/challenges/[id]/paid-votes/checkout/route.ts"), "paid vote checkout route must exist.");
assert(exists("app/api/challenges/[id]/paid-votes/status/route.ts"), "paid vote status route must exist.");
assert(checkoutRoute.includes("requireRequestUser"), "paid vote checkout must require auth.");
assert(checkoutRoute.includes("createPendingPaidVotePurchase"), "paid vote checkout must create pending purchase foundation.");
assert(checkoutRoute.includes("paymentPurpose=paid_vote"), "checkout success URL must carry paid_vote purpose.");
assert(checkoutRoute.includes("checkoutSuccessGrantsVotes: false"), "checkout route must not grant votes.");
assert(votesPage.includes('voteMode: "free"') && votesPage.includes("Cast Free Vote"), "/votes must remain the normal voting page.");
assert(votesPage.includes('/challenges/${challengeId}/bonus-votes') && !votesPage.includes("Confirm DoroCoin Votes"), "/votes must link to, not contain, DoroCoin bonus voting.");
assert(bonusVotesPage.includes("DoroCoin Bonus Votes") && bonusVotesPage.includes('voteMode: mode'), "/bonus-votes must own DoroCoin additional voting.");
assert(bonusVotesPage.includes("if (!votingOpen)") && bonusVotesPage.indexOf("if (!votingOpen)") < bonusVotesPage.indexOf("Confirm DoroCoin Votes"), "bonus vote tools must be gated before voting opens.");
assert(bonusVotesPage.includes("eligibleSubmissionCount <= 0 || !submissions.length") && bonusVotesPage.indexOf("eligibleSubmissionCount <= 0 || !submissions.length") < bonusVotesPage.indexOf("Confirm DoroCoin Votes"), "bonus vote tools must be gated when no eligible submissions exist.");
assert(!/convert(?:ed)? to cash|cash conversion|withdraw DoroCoin/i.test(votesPage + bonusVotesPage), "voting pages must not offer DoroCoin cash conversion or withdrawal.");
assert(webhook.includes("paymentPurpose === \"paid_vote\""), "webhook must branch for paid_vote.");
assert(webhook.includes("confirmPaidVotePurchase"), "webhook must confirm paid vote purchases via helper.");
assert(helper.includes("assertStripeSessionMatchesRecord(session, purchase, \"paid_vote\")"), "paid vote confirmation must verify stored payment record.");
assert(helper.includes("paidVoteCredits") && helper.includes("votesRemaining"), "paid vote credits must be tracked after webhook confirmation.");
assert(helper.includes("reusable: false"), "paid vote credits must not be reusable.");
assert(helper.includes("confirmedPaidVoteGrossCents"), "confirmed paid-vote revenue source must be available.");
assert(helper.includes("if (purchase.status === \"confirmed\")"), "paid vote confirmation must be idempotent.");
assert(webhook.includes("checkout.session.expired") && helper.includes("expirePaidVotePurchase"), "expired paid vote checkout state must be tracked.");
assert(voteRoute.includes("voteMode: body.voteMode"), "free and DoroCoin vote modes must remain server-delegated.");
assert(votingHelper.includes("canVoteOnChallenge(challenge)") && votingHelper.includes('input.voteMode === "dorocoin"'), "bonus votes must not count without valid server voting state.");
assert(!votesPage.includes("Paid Votes Recorded") && !votesPage.includes("Paid vote credits granted"), "success page/UI must not fake paid vote credits.");
assert(!helper.includes("stripe.transfers.create") && !helper.includes("payouts.create"), "paid vote foundation must not execute payouts.");
assert(webhook.includes("session.mode === \"subscription\""), "subscription webhook branch must remain present.");

console.log("Paid vote checkout foundation checks passed.");
