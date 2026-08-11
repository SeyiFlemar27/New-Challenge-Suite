import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function sourceTree(root) {
  if (!fs.existsSync(root)) return "";
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceTree(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [read(target)] : [];
  }).join("\n");
}

export function run(label) {
  const policy = read("lib/server/kyc-policy.ts");
  const create = read("app/api/challenges/route.ts");
  const publish = read("app/api/challenges/[id]/publish/route.ts");
  const tournament = read("lib/server/tournament-operations.ts");
  const join = read("app/api/challenges/[id]/join/route.ts");
  const submissions = read("app/api/submissions/route.ts");
  const predictions = read("app/api/predictions/route.ts");
  const withdrawals = read("app/api/withdrawals/route.ts");
  const wallet = read("lib/server/wallet-architecture.ts");
  const settlement = read("lib/server/challenge-settlement.ts");
  const predictionSettlement = read("lib/server/prediction-settlement.ts");
  const winnerClaims = read("app/api/winner-claims/route.ts");
  const webhook = read("app/api/kyc/sumsub/webhook/route.ts");
  const sumsub = read("lib/server/sumsub.ts");
  const builder = read("components/challenge-builder.tsx");
  const admin = read("components/admin/admin-control-center.tsx");
  const host = sourceTree("app/host") + sourceTree("app/api/host");
  const sponsor = sourceTree("app/sponsor") + sourceTree("app/api/sponsor");
  const voting = sourceTree("app/api/votes") + sourceTree("app/api/challenges/[id]/votes");
  const productUi = [
    sourceTree("app/challenges"),
    sourceTree("app/wallet"),
    sourceTree("app/earnings"),
    sourceTree("app/host"),
    sourceTree("app/sponsor"),
    sourceTree("app/tournaments"),
    builder
  ].join("\n");

  assert.match(policy, /mode: "kyc_free_for_now"/);
  for (const action of ["challengeCreation", "paidChallengePublishing", "privateChallengePublishing", "liveEventPublishing", "tournamentPublishing", "joining", "paidParticipation", "submission", "voting", "prediction", "hostTools", "sponsorActions", "walletAccess", "withdrawalRequest", "internalPrizeCredit", "creatorEarningCredit"]) {
    assert.match(policy, new RegExp(action + ": false"), action + " must be KYC-free");
  }
  assert(!create.includes("KYC_REQUIRED") && !publish.includes("KYC_REQUIRED"), "challenge publishing must not have a KYC gate");
  assert(!tournament.includes("KYC_REQUIRED"), "tournament joining must not have a KYC gate");
  assert(!join.includes("KYC_REQUIRED") && !submissions.includes("KYC_REQUIRED"), "joining and submission must not have KYC gates");
  assert(!voting.includes("KYC_REQUIRED"), "voting must not have a KYC gate");
  assert(!predictions.includes('"KYC_REQUIRED"'), "Prediction Arena must not have a KYC gate");
  assert(!host.includes("KYC_REQUIRED") && !sponsor.includes("KYC_REQUIRED"), "Host and sponsor workspaces must not have KYC gates");
  assert(!withdrawals.includes('"KYC_REQUIRED"') && withdrawals.includes("Withdrawal request submitted for review."), "withdrawal requests must be KYC-free and review-controlled");
  assert.match(wallet, /kycRequired: isKycRequiredForAction\("withdrawalRequest"\)/);
  assert(!settlement.includes("kycRequiredBeforeWithdrawal: true") && !predictionSettlement.includes("kycRequiredBeforeWithdrawal: true"), "internal credits must not be KYC-gated");
  assert(!winnerClaims.includes("identityDocument instanceof File") && winnerClaims.includes('identityDocumentStorageStatus: "not_required"'), "winner claims must not require identity documents");
  for (const copy of ["Identity verification is required before publishing a paid challenge.", "KYC verification is required before withdrawals.", "Complete KYC to continue.", "KYC is required before withdrawal approval."]) {
    assert(!productUi.includes(copy), "user-facing blocker remains: " + copy);
  }
  assert(admin.includes("Verification is not currently required for normal product actions"), "admin must explain historical verification records");
  assert(sumsub.includes("timingSafeEqual") && webhook.includes("sumsubWebhookEvents") && webhook.includes("rawIdentityStored: false"), "Sumsub safety/history infrastructure must remain");
  for (const safety of ["requireRequestUser", "getUserPlanAccess", "validateEntryFee"]) assert(create.includes(safety), "challenge safety check missing: " + safety);
  assert(join.includes("payment") && submissions.includes("submission"), "payment/submission business validation must remain");
  assert(withdrawals.includes("WITHDRAWAL_SOURCE_NOT_ELIGIBLE") && withdrawals.includes("PAYOUT_METHOD_NOT_OWNED"), "withdrawal ownership checks must remain");
  assert(predictions.includes("AGE_VERIFICATION_REQUIRED") && predictions.includes("ACCOUNT_RESTRICTED"), "Prediction Arena non-KYC safety checks must remain");
  assert(builder.includes("Payments are provider-confirmed only"), "provider-confirmed payment copy must remain");
  for (const source of [withdrawals, settlement, predictionSettlement]) {
    assert(!/payoutExecuted:\s*true|externalPayoutExecuted:\s*true|payoutProviderCalled:\s*true/.test(source), "fake or automatic payout execution was introduced");
  }
  console.log(label + ": ok");
}
