import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const flow = read("lib/server/challenge-production-flow.ts");
const payments = read("lib/server/monetization-payments.ts");
assert(flow.includes("createRefundReviewFoundation") && flow.includes("review_required") && flow.includes("providerRefundStatus: \"not_started\""), "refund review foundation must create review-required provider-not-started records");
assert(payments.includes("refundStatus: \"refund_review\"") && payments.includes("refundExecutionEnabled: false"), "paid-entry payment records must include refund review status without execution");
assert(!flow.includes("stripe.refunds.create") && !payments.includes("stripe.refunds.create"), "refund provider execution must not be added");
console.log("cancellation refund review foundation checks passed");