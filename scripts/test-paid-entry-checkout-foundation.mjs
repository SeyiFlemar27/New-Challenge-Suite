import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const checkoutRoute = read("app/api/challenges/[id]/entry-checkout/route.ts");
const statusRoute = read("app/api/challenges/[id]/entry-payment-status/route.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const helper = read("lib/server/monetization-payments.ts");
const joinRoute = read("app/api/challenges/[id]/join/route.ts");
const submissionRoute = read("app/api/submissions/route.ts");
const successPage = read("app/checkout/success/page.tsx");
const challengeValidation = read("lib/server/challenge-validation.ts");
const challengeCreate = read("app/api/challenges/route.ts");

assert(exists("app/api/challenges/[id]/entry-checkout/route.ts"), "paid entry checkout route must exist.");
assert(exists("app/api/challenges/[id]/entry-payment-status/route.ts"), "paid entry status route must exist.");
assert(checkoutRoute.includes("requireRequestUser"), "paid entry checkout must require auth.");
assert(checkoutRoute.includes("isPaidEntryChallenge"), "paid entry checkout must require eligible paid-entry challenge.");
assert(checkoutRoute.includes("entryAgreementAccepted"), "paid entry checkout must require entry agreement.");
assert(helper.includes("MINIMUM_ENTRY_FEE_CENTS") && helper.includes("validateEntryFee"), "entry fee minimum must be helper-based.");
assert(helper.includes("paymentPurpose: \"challenge_entry\""), "entry payment record must use challenge_entry purpose.");
assert(checkoutRoute.includes("paymentPurpose=challenge_entry"), "checkout success URL must carry challenge_entry purpose.");
assert(checkoutRoute.includes("checkoutSuccessActivatesEntry: false"), "checkout route must not activate entry.");
assert(successPage.includes("will update only after secure webhook confirmation"), "success page must not activate paid entry.");
assert(webhook.includes("paymentPurpose === \"challenge_entry\""), "webhook must branch for challenge_entry.");
assert(webhook.includes("confirmChallengeEntryPayment"), "webhook must confirm paid entry via helper.");
assert(helper.includes("assertStripeSessionMatchesRecord(session, payment, \"challenge_entry\")"), "webhook confirmation must verify stored payment record.");
assert(helper.includes("status: \"confirmed\"") && helper.includes("webhookConfirmed: true"), "paid entry must be confirmed only from webhook helper.");
assert(helper.includes("paidEntryConfirmedCount") && helper.includes("confirmedEntryFeeGrossCents"), "confirmed entry revenue source must be recorded for ledger foundation.");
assert(helper.includes("if (payment.status === \"confirmed\")"), "paid entry confirmation must be idempotent.");
assert(webhook.includes("checkout.session.expired") && helper.includes("expireChallengeEntryPayment"), "expired checkout state must be tracked.");
assert(joinRoute.includes("PAID_ENTRY_PAYMENT_REQUIRED"), "normal join must not bypass paid entry payment.");
assert(submissionRoute.includes("PAID_ENTRY_PAYMENT_REQUIRED"), "submission must require confirmed paid entry payment.");
assert(challengeValidation.includes("entryFeeAmountCents"), "challenge validation must include paid entry amount.");
assert(challengeCreate.includes("FREE_BASIC_ADVANCED_LOCKED") && challengeCreate.includes("paidEntryRequested"), "free users must remain blocked from paid-entry challenge creation.");
assert(!webhook.includes("finalizeApprovedWinnerProposalLedger") || webhook.indexOf("finalizeApprovedWinnerProposalLedger") === -1, "webhook must not finalize ledgers or release prizes.");
assert(!helper.includes("stripe.transfers.create") && !helper.includes("payouts.create"), "paid entry foundation must not execute payouts.");
assert(webhook.includes("session.mode === \"subscription\""), "subscription webhook/checkout branch must remain present.");

console.log("Paid entry checkout foundation checks passed.");

