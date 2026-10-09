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
assert(checkoutRoute.includes("PAID_VOTE_CHECKOUT_RETIRED"), "legacy card-based vote checkout must be retired.");
assert(checkoutRoute.indexOf("PAID_VOTE_CHECKOUT_RETIRED") < checkoutRoute.indexOf("await createPendingPaidVotePurchase"), "retirement gate must run before any legacy checkout writer.");
assert(votesPage.includes('voteMode: "free"') && votesPage.includes("Cast Free Vote"), "/votes must remain the normal voting page.");
assert(votesPage.includes('/challenges/${challengeId}/bonus-votes') && !votesPage.includes("Confirm Challenge Credit Votes"), "/votes must link to, not contain, Challenge Credit bonus voting.");
assert(bonusVotesPage.includes("Additional Votes") && bonusVotesPage.includes('voteMode: mode'), "/bonus-votes must own DoroCoin additional voting.");
assert(bonusVotesPage.includes("if (!votingOpen)") && bonusVotesPage.indexOf("if (!votingOpen)") < bonusVotesPage.indexOf("Confirm DoroCoin Votes"), "bonus vote tools must be gated before voting opens.");
assert(bonusVotesPage.includes("eligibleSubmissionCount <= 0 || !submissions.length") && bonusVotesPage.indexOf("eligibleSubmissionCount <= 0 || !submissions.length") < bonusVotesPage.indexOf("Confirm DoroCoin Votes"), "bonus vote tools must be gated when no eligible submissions exist.");
assert(/cannot be withdrawn or converted to cash/i.test(bonusVotesPage), "voting must disclose the non-cash DoroCoin policy.");
assert(!/Convert DoroCoins to cash|Cash out DoroCoin|Withdraw DoroCoin/i.test(votesPage + bonusVotesPage), "voting pages must not offer DoroCoin cash conversion or withdrawal.");
assert(webhook.includes("paymentPurpose === \"paid_vote\""), "webhook must retain compatibility for already-created paid_vote sessions.");
assert(webhook.includes("confirmPaidVotePurchase"), "legacy paid vote webhook confirmation must remain provider-verified.");
assert(helper.includes("assertStripeSessionMatchesRecord(session, purchase, \"paid_vote\")"), "legacy paid vote confirmation must verify its stored payment record.");
assert(helper.includes("if (purchase.status === \"confirmed\")"), "legacy paid vote confirmation must be idempotent.");
assert(webhook.includes("checkout.session.expired") && helper.includes("expirePaidVotePurchase"), "legacy paid vote checkout expiration state must remain tracked.");
assert(voteRoute.includes("voteMode: body.voteMode"), "free and DoroCoin vote modes must remain server-delegated.");
assert(votingHelper.includes("canVoteOnChallenge(challenge)") && votingHelper.includes('input.voteMode === "dorocoin"'), "bonus votes must not count without valid server voting state.");
assert(votingHelper.includes('input.voteMode === "dorocoin"') && !votingHelper.includes('input.voteMode === "credits"'), "only DoroCoins can buy additional votes.");
assert(!votesPage.includes("Paid Votes Recorded") && !votesPage.includes("Paid vote credits granted"), "success page/UI must not fake paid vote credits.");
assert(!helper.includes("stripe.transfers.create") && !helper.includes("payouts.create"), "paid vote foundation must not execute payouts.");
assert(webhook.includes("session.mode === \"subscription\""), "subscription webhook branch must remain present.");

console.log("Paid vote checkout foundation checks passed.");
