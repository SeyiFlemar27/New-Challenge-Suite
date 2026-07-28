import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const detailPage = read("app/challenges/[id]/page.tsx");
const submissionPage = read("app/challenges/[id]/join/page.tsx");
const entryCheckoutRoute = read("app/api/challenges/[id]/entry-checkout/route.ts");
const entryStatusRoute = read("app/api/challenges/[id]/entry-payment-status/route.ts");
const joinRoute = read("app/api/challenges/[id]/join/route.ts");
const submissionRoute = read("app/api/submissions/route.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const helper = read("lib/server/monetization-payments.ts");
const successPage = read("app/checkout/success/page.tsx");
const cancelPage = read("app/checkout/cancel/page.tsx");
const builder = read("components/challenge-builder.tsx");
const challengeApi = read("app/api/challenges/route.ts");
const challengeDetailApi = read("app/api/challenges/[id]/route.ts");
const viewerState = read("lib/server/challenge-viewer-state.ts");
const publicChallenge = read("lib/server/public-challenge.ts");

assert(exists("app/api/challenges/[id]/entry-checkout/route.ts"), "paid entry checkout API must exist.");
assert(exists("app/api/challenges/[id]/entry-payment-status/route.ts"), "paid entry status API must exist.");

assert(detailPage.includes("paidEntryRequired") && detailPage.includes("entryFeeCents > 0"), "paid challenge CTA must activate only when entry fee is enabled and greater than zero.");
assert(detailPage.includes("challengePaidEntry") && detailPage.includes("userPaidEntry"), "detail page must read normalized paid-entry state from the backend payload.");
assert(detailPage.includes("Join Challenge") && detailPage.includes("Submit Now") && detailPage.includes("Pay & Enroll"), "detail page must support free join, submit, and paid-entry CTAs.");
assert(detailPage.includes("paidEntryRequired ? alreadySubmitted") && detailPage.includes("paidEntryEnrolled") && detailPage.includes("paidEntryPending"), "paid-entry CTA must be state-driven by submitted/enrolled/pending states.");
assert(!detailPage.includes("Enroll Now"), "detail page must not show legacy Enroll Now CTA.");
assert(detailPage.includes("Sponsor accounts cannot join or submit entries"), "sponsor accounts must be blocked from participant CTAs.");

assert(challengeDetailApi.includes("paidEntryState") && challengeDetailApi.includes("challenge: { id: challengeSnap.id, ...publicChallenge, paidEntry:"), "challenge detail API must expose normalized paid-entry state with sanitized public challenge data.");
assert(challengeDetailApi.includes("canPay") && challengeDetailApi.includes("canSubmit") && challengeDetailApi.includes("paymentStatus"), "challenge detail API must expose payment-state flags for paid-entry UI.");
assert(publicChallenge.includes("publicChallengeFields") && !publicChallenge.includes("\"monetization\""), "raw monetization remains omitted from public challenge fields, so paid-entry state must be explicit.");
assert(viewerState.includes("Entry fee required") && submissionPage.includes("Pay Entry Fee"), "submission page must show an actionable paid-entry gate.");
assert(submissionPage.includes("challengePaidEntry") && submissionPage.includes("userPaidEntry"), "submission page must read normalized paid-entry state from the backend payload.");
assert(submissionPage.includes("Pay Entry Fee") && submissionPage.includes("entry-checkout"), "unpaid users on submission page must get Pay Entry Fee action.");
assert(submissionPage.includes("submissionAccess") && submissionPage.includes("canSubmitNow") && submissionPage.includes("SubmissionAccessCard"), "submission form must remain hidden until backend submissionAccess.canSubmit is true.");
assert(viewerState.includes("Sponsors cannot submit entries") && submissionPage.includes("SubmissionAccessCard"), "sponsor accounts must be blocked from paid-entry submission flow.");

assert(entryCheckoutRoute.includes("requireRequestUser"), "paid-entry checkout must require authentication.");
assert(entryCheckoutRoute.includes("isSponsorProfile(profile)") && entryCheckoutRoute.includes("SPONSOR_ACCOUNT_BLOCKED"), "sponsors must not be able to Pay & Enroll.");
assert(entryCheckoutRoute.includes("isChallengeJoinable(challenge)"), "Pay & Enroll must only be available during registration/join period.");
assert(entryCheckoutRoute.includes("paidEntryAmountCents(challenge)") && entryCheckoutRoute.includes("currency: \"usd\""), "checkout amount and USD currency must be derived server-side.");
assert(entryCheckoutRoute.includes("checkoutLineItem") && helper.includes("price_data") && !entryCheckoutRoute.includes("STRIPE_PRICE"), "paid entry must use dynamic one-time Checkout amounts.");
assert(entryCheckoutRoute.includes("checkoutSuccessActivatesEntry: false"), "checkout route must not activate enrollment.");

assert(helper.includes("paymentPurpose: \"challenge_entry_fee\""), "payment record must use challenge_entry_fee purpose.");
assert(helper.includes("reservationStatus: \"reserved\"") && helper.includes("reservationExpiresAt"), "pending checkout must create a reserved slot with expiry.");
assert(helper.includes("participantId: null") && helper.includes("pendingReservationOnly: true"), "pending checkout must not create active participant before webhook.");
assert(helper.includes("activeReservationCount") && helper.includes("challengeCapacity"), "reservation must count toward capacity to prevent overselling.");
assert(helper.includes("reservationStatus: \"converted_to_participant\"") && helper.includes("status: \"active\"") && helper.includes("entryPaymentStatus: \"paid\""), "webhook confirmation must convert a valid reservation into active enrollment.");
assert(helper.includes("payment_review_required") && helper.includes("admin_review"), "expired or unavailable reservations must move late webhook payments to review.");
assert(helper.includes("refundStatus: \"refund_review\"") && helper.includes("refundExecutionEnabled: false"), "refund statuses must be foundation-only without Stripe refund execution.");
assert(helper.includes("pendingEntryFeeRevenueGrossCents") && helper.includes("pendingChallengeRevenue: true"), "entry-fee money must be recorded as pending challenge revenue only.");
assert(helper.includes("calculatePaidRevenueSplit(amountCents, \"entry_fee\")"), "existing payout split helper must be reused for platform fee foundation.");
assert(!helper.includes("stripe.refunds.create") && !helper.includes("stripe.transfers.create") && !helper.includes("payouts.create"), "paid-entry flow must not execute refunds, payouts, or transfers.");

assert(webhook.includes("paymentPurpose === \"challenge_entry_fee\"") && webhook.includes("confirmChallengeEntryPayment"), "webhook must be the enrollment confirmation path.");
assert(webhook.includes("expireChallengeEntryPayment"), "checkout expired events must be tracked.");
assert(entryCheckoutRoute.includes("?payment=processing") && detailPage.includes("paymentReturnState"), "entry checkout must return to detail for backend-confirmed payment state.");
assert(cancelPage.includes("No subscription, paid entry") && cancelPage.includes("Back to Challenge"), "cancel return must keep user unenrolled and route back to challenge.");
assert(entryStatusRoute.includes("challenge_entry_fee_") && entryStatusRoute.includes("legacyPaymentId"), "payment status must read current and legacy payment records.");
assert(joinRoute.includes("PAID_ENTRY_PAYMENT_REQUIRED") && submissionRoute.includes("PAID_ENTRY_PAYMENT_REQUIRED"), "free join/submission routes must not bypass paid-entry payment.");
assert(submissionRoute.includes("[\"paid\", \"confirmed\"].includes"), "submissions must unlock only after confirmed paid status.");
assert(builder.includes("Monetized challenges are available to Creator, Host, and approved Enterprise accounts."), "free users must remain unable to create paid-entry challenges.");
assert(challengeApi.includes("paidEntryRequested") && challengeApi.includes("FREE_BASIC_ADVANCED_LOCKED"), "API must keep free-user paid-entry creation lock.");

console.log("Paid entry enrollment flow checks passed.");

