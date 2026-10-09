import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite";
const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);
const runId = `enterprise_finance_${randomUUID().replaceAll("-", "")}`;
const orgA = `${runId}_org_a`;
const orgB = `${runId}_org_b`;
const orgC = `${runId}_org_c`;
const challengeA = `${runId}_challenge_a`;
const challengeB = `${runId}_challenge_b`;
const users = {};
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}

async function createUser(label) {
  const email = `${label}-${randomUUID()}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return { uid: body.localId, token: body.idToken };
}

function bearerRequest(url, token) {
  return new Request(url, token ? { headers: { authorization: `Bearer ${token}` } } : {});
}

function iso(day) {
  return `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;
}

try {
  const labels = ["finance-a", "finance-b", "operations-no-finance", "revoked", "expired", "finance-corrupt-wallet"];
  const createdUsers = await Promise.all(labels.map(createUser));
  labels.forEach((label, index) => { users[label] = createdUsers[index]; });
  const roles = [
    { org: orgA, permissions: ["finance.view"], status: "active", expiresAt: "2099-01-01T00:00:00.000Z" },
    { org: orgB, permissions: ["finance.view"], status: "active", expiresAt: "2099-01-01T00:00:00.000Z" },
    { org: orgA, permissions: ["challenge.view"], status: "active", expiresAt: "2099-01-01T00:00:00.000Z" },
    { org: orgA, permissions: ["finance.view"], status: "revoked", expiresAt: "2099-01-01T00:00:00.000Z" },
    { org: orgA, permissions: ["finance.view"], status: "active", expiresAt: "2000-01-01T00:00:00.000Z" },
    { org: orgC, permissions: ["finance.view"], status: "active", expiresAt: "2099-01-01T00:00:00.000Z" },
  ];
  await Promise.all(labels.map((label, index) => db.collection("users").doc(users[label].uid).set({
    emailVerified: true,
    enterpriseAccessStatus: "approved",
    staffAccess: { ...roles[index], role: index === 2 ? "operations" : "finance", scope: "all_official", organizationId: roles[index].org, onboardingComplete: true },
  }, { merge: true })));
  await auth.verifyIdToken(users["finance-a"].token);

  await Promise.all([
    db.collection("challenges").doc(challengeA).set({ officialChallenge: true, ownershipType: "challenge_suite_official", organizationOwnerId: orgA, enterpriseOrganizationId: orgA, enterpriseFinanceContextId: orgA, prizeValue: 50, createdAt: iso(1) }),
    db.collection("challenges").doc(challengeB).set({ officialChallenge: true, ownershipType: "challenge_suite_official", organizationOwnerId: orgB, enterpriseOrganizationId: orgB, enterpriseFinanceContextId: orgB, createdAt: iso(1) }),
    db.collection("enterpriseFinanceWallets").doc(orgA).set({ organizationId: orgA, currency: "USD", pendingBalanceCents: 2000, lifetimeChallengeRevenueCents: 2000, withdrawalsEnabled: false, personalWalletFallback: false, updatedAt: iso(10) }),
    db.collection("enterpriseFinanceWallets").doc(orgB).set({ organizationId: orgB, currency: "USD", pendingBalanceCents: 9000, lifetimeChallengeRevenueCents: 9000, withdrawalsEnabled: false, updatedAt: iso(10) }),
    db.collection("enterprisePrizeFundingLimits").doc(challengeA).set({ challengeId: challengeA, organizationOwnerId: orgA, configuredPrizeCents: 500000, exposureCents: 600650, maximumCents: 1000000, creatorConfirmedCents: 0, creatorReservedCents: 500000, sponsorConfirmedCents: 100000, entryConfirmedCents: 650, promotionalConfirmedCents: 0, additionalReservedCents: 0, reservedCents: 500000, updatedAt: iso(10) }),
    db.collection("enterprisePrizeFundingLimits").doc(challengeB).set({ challengeId: challengeB, organizationOwnerId: orgB, configuredPrizeCents: 900000, exposureCents: 900000, maximumCents: 1000000, updatedAt: iso(10) }),
  ]);

  const ledger = db.collection("challengeFinancialLedger");
  const orgARows = [
    { id: `${runId}_creator_funding`, sourceType: "creator_funded", shareType: "reserved_prize_funds", amountCents: 500000, status: "reserved", direction: "credit", createdAt: iso(2) },
    { id: `${runId}_sponsor_prize_refunded`, sourceType: "sponsor_prize_contribution", shareType: "winner_share", amountCents: 1000, status: "refunded", direction: "credit", createdAt: iso(3) },
    { id: `${runId}_sponsor_prize`, sourceType: "sponsor_prize_contribution", shareType: "winner_share", amountCents: 100000, status: "confirmed", direction: "credit", createdAt: iso(4) },
    { id: `${runId}_entry_winner`, sourceType: "entry_fee", shareType: "winner_share", amountCents: 650, status: "confirmed", direction: "credit", createdAt: iso(5) },
    { id: `${runId}_entry_org`, sourceType: "entry_fee", shareType: "creator_host_share", amountCents: 200, status: "confirmed", direction: "credit", createdAt: iso(6) },
    { id: `${runId}_entry_platform`, sourceType: "entry_fee", shareType: "platform_share", amountCents: 150, status: "confirmed", direction: "credit", createdAt: iso(7) },
    { id: `${runId}_refund`, sourceType: "enterprise_prize_funding_refund", shareType: "winner_share", amountCents: 1000, status: "confirmed", direction: "debit", refundOf: `${runId}_sponsor_prize_refunded`, createdAt: iso(8) },
    { id: `${runId}_paid_vote`, sourceType: "paid_vote_revenue", shareType: "platform_share", amountCents: 10000, status: "confirmed", direction: "credit", createdAt: iso(9) },
  ];
  await Promise.all(orgARows.map((row) => ledger.doc(row.id).set({ ...row, organizationOwnerId: orgA, financialOwnerType: "organization", challengeId: challengeA, currency: "USD" })));
  await Promise.all([
    ledger.doc(`${runId}_org_b_row`).set({ organizationOwnerId: orgB, financialOwnerType: "organization", challengeId: challengeB, sourceType: "creator_funded", amountCents: 900000, status: "confirmed", direction: "credit", createdAt: iso(9) }),
    ledger.doc(`${runId}_personal_row`).set({ organizationOwnerId: null, financialOwnerType: "user", userId: users["finance-a"].uid, challengeId: challengeA, sourceType: "creator_funded", amountCents: 777777, status: "confirmed", direction: "credit", createdAt: iso(9) }),
    ledger.doc(`${runId}_conflicting_owner`).set({ organizationOwnerId: orgA, enterpriseOrganizationId: orgB, financialOwnerType: "organization", challengeId: challengeA, sourceType: "creator_funded", amountCents: 888888, status: "confirmed", direction: "credit", createdAt: iso(9) }),
    ledger.doc(`${runId}_missing_owner`).set({ financialOwnerType: "user", challengeId: challengeA, sourceType: "creator_funded", amountCents: 999999, status: "confirmed", direction: "credit", createdAt: iso(9) }),
  ]);
  await db.collection("enterpriseFinanceLedger").doc(`${runId}_org_revenue`).set({ organizationId: orgA, challengeId: challengeA, settlementId: `${runId}_settlement`, sourceType: "enterprise_challenge_revenue_share", amountCents: 2000, currency: "USD", status: "pending_finance_review", direction: "credit", confirmedPaymentSourcesOnly: true, externalPayoutExecuted: false, createdAt: iso(10) });
  await db.collection("enterpriseFinanceLedger").doc(`${runId}_foreign_revenue`).set({ organizationId: orgB, challengeId: challengeB, sourceType: "enterprise_challenge_revenue_share", amountCents: 9000, status: "pending_finance_review", createdAt: iso(10) });
  await Promise.all([
    db.collection("cashLedger").doc(`${runId}_refund_cash`).set({ id: `${runId}_refund_cash`, transactionType: "refund", sourceType: "refund", sourceId: `${runId}_refund_case`, challengeId: challengeA, organizationOwnerId: orgA, financialOwnerType: "organization", amountCents: 1000, currency: "USD", direction: "debit", status: "posted", createdAt: iso(10) }),
    db.collection("cashLedger").doc(`${runId}_foreign_refund_cash`).set({ id: `${runId}_foreign_refund_cash`, transactionType: "refund", challengeId: challengeB, organizationOwnerId: orgB, amountCents: 9000, direction: "debit", status: "posted", createdAt: iso(10) }),
  ]);
  await db.collection("challengeSettlements").doc(`${runId}_settlement`).set({ enterpriseOrganizationId: orgA, enterpriseFinanceIsolated: true, challengeId: challengeA, settlementId: `${runId}_settlement`, status: "created_pending_review", creatorHostAmount: 2000, winnerDistribution: [{ userId: "winner-private-id", netAmountCents: 650 }], approvedWinnerIds: ["winner-private-id"], externalPayoutExecuted: false, payoutProviderCalled: false, createdAt: iso(10) });
  await db.collection("challengeSettlements").doc(`${runId}_foreign_settlement`).set({ enterpriseOrganizationId: orgB, challengeId: challengeB, creatorHostAmount: 9000, createdAt: iso(10) });

  const { GET } = await import("../app/api/enterprise/finance/route.ts");
  const baseUrl = "http://localhost/api/enterprise/finance";
  const unauthenticated = await GET(bearerRequest(baseUrl));
  equal(unauthenticated.status, 401, "Unauthenticated finance read must be denied.");
  const noPermission = await GET(bearerRequest(baseUrl, users["operations-no-finance"].token));
  equal(noPermission.status, 403, "User without finance.view must be denied.");
  const revoked = await GET(bearerRequest(baseUrl, users.revoked.token));
  equal(revoked.status, 403, "Revoked Enterprise membership must be denied.");
  const expired = await GET(bearerRequest(baseUrl, users.expired.token));
  equal(expired.status, 403, "Expired Enterprise membership must be denied.");
  const forged = await GET(bearerRequest(`${baseUrl}?organizationId=${orgB}`, users["finance-a"].token));
  equal(forged.status, 403, "Forged organization scope must be denied.");

  const orgAResponse = await GET(bearerRequest(baseUrl, users["finance-a"].token));
  equal(orgAResponse.status, 200, "Authorized Org A user must load Org A finance.");
  const orgAData = (await orgAResponse.json()).data;
  equal(orgAData.organizationId, orgA, "Organization scope must derive from server authorization.");
  equal(orgAData.wallet.pendingBalanceCents, 2000, "Organization wallet pending balance must be authoritative.");
  equal(orgAData.wallet.lifetimeChallengeRevenueCents, 2000, "Lifetime organization revenue must use the wallet aggregate.");
  equal(orgAData.prizeExposure.items[0].configuredPrizeObligationCents, 500000, "Configured prize obligation must remain distinct from received cash.");
  equal(orgAData.prizeExposure.items[0].exposureCents, 600650, "Configured obligation, additive Sponsor funding, and 65% entry allocation must be represented once.");
  equal(orgAData.prizeExposure.items[0].reserved.creatorFundingCents, 500000, "Pending creator funding remains reserved rather than confirmed cash.");
  equal(orgAData.prizeExposure.items[0].confirmed.sponsorPrizeCents, 100000, "Confirmed Sponsor prize funding remains prize-directed.");
  equal(orgAData.prizeExposure.items[0].confirmed.paidEntryWinnerAllocationCents, 650, "Only the 65% entry allocation contributes to prize exposure.");
  equal(orgAData.challengeTransactions.items.length, 8, "Only organization-attributed, consistent records should be included.");
  check(!JSON.stringify(orgAData).includes("999999"), "Missing organization attribution must not fall back to personal finance.");
  check(!JSON.stringify(orgAData).includes("888888"), "Conflicting organization attribution must fail closed.");
  check(!JSON.stringify(orgAData).includes("777777"), "Personal Workspace ledger records must be excluded.");
  check(!JSON.stringify(orgAData).includes("9000"), "Org A response must not contain Org B financial records.");
  const sponsor = orgAData.challengeTransactions.items.find((item) => item.id === `${runId}_sponsor_prize`);
  equal(sponsor.sourceType, "sponsor_prize_contribution", "Sponsor contribution must remain prize-directed.");
  check(orgAData.accounting.sponsorPrizeContributionsAreOrganizationRevenue === false, "Sponsor prize contribution must not be labeled organization earnings.");
  const winnerShare = orgAData.challengeTransactions.items.find((item) => item.id === `${runId}_entry_winner`);
  const organizationShare = orgAData.challengeTransactions.items.find((item) => item.id === `${runId}_entry_org`);
  const platformShare = orgAData.challengeTransactions.items.find((item) => item.id === `${runId}_entry_platform`);
  equal(winnerShare.amountCents, 650, "Paid-entry winner allocation must retain the 65% amount.");
  equal(organizationShare.amountCents, 200, "Paid-entry organization allocation must retain the 20% amount.");
  equal(platformShare.amountCents, 150, "Paid-entry platform allocation must retain the 15% amount.");
  const refund = orgAData.challengeTransactions.items.find((item) => item.id === `${runId}_refund`);
  equal(refund.refundOf, `${runId}_sponsor_prize_refunded`, "Refund reversal must retain source attribution.");
  equal(refund.direction, "debit", "Refund must be shown as a reversal, not new revenue.");
  const settlement = orgAData.settlements.items[0];
  equal(settlement.organizationRevenueCents, 2000, "Settlement organization attribution must be retained.");
  equal(settlement.winnerDistributionCents, 650, "Winner settlement amount must remain winner-owned.");
  check(!JSON.stringify(orgAData).includes("winner-private-id"), "Winner personal identity must not be exposed in organization finance.");
  equal(orgAData.organizationRevenueTransactions.items.length, 1, "Only Org A revenue records should be returned.");
  check(orgAData.organizationRevenueTransactions.items[0].externalPayoutExecuted === false, "Reporting must not imply payout execution.");
  equal(orgAData.cashTransactions.items.length, 1, "Organization cash ledger must include the matching refund record only.");
  equal(orgAData.cashTransactions.items[0].sourceId, `${runId}_refund_case`, "Cash reversal must retain its refund-case source reference.");
  equal(orgAData.cashTransactions.items[0].direction, "debit", "Cash refund must appear as a debit reversal.");

  const orgBResponse = await GET(bearerRequest(baseUrl, users["finance-b"].token));
  equal(orgBResponse.status, 200, "Authorized Org B user may read Org B records.");
  const orgBData = (await orgBResponse.json()).data;
  equal(orgBData.organizationId, orgB, "Org B request must stay in Org B scope.");
  equal(orgBData.wallet.pendingBalanceCents, 9000, "Org B receives its own wallet aggregate.");
  check(!JSON.stringify(orgBData).includes("2000"), "Org B response must not contain Org A amounts.");

  const paginationDocs = [
    db.collection("challengeFinancialLedger").where("organizationOwnerId", "==", orgA).count().get(),
    db.collection("cashLedger").where("organizationOwnerId", "==", orgA).count().get(),
    db.collection("enterpriseFinanceLedger").where("organizationId", "==", orgA).count().get(),
    db.collection("enterprisePrizeFundingLimits").where("organizationOwnerId", "==", orgA).count().get(),
    db.collection("challengeSettlements").where("enterpriseOrganizationId", "==", orgA).count().get(),
  ];
  const beforeCounts = await Promise.all(paginationDocs);
  const firstPageResponse = await GET(bearerRequest(`${baseUrl}?pageSize=1`, users["finance-a"].token));
  equal(firstPageResponse.status, 200, "Bounded first page must succeed.");
  let transactionPage = (await firstPageResponse.json()).data.challengeTransactions;
  const pageIds = [];
  for (let page = 0; page < 20; page += 1) {
    check(transactionPage.items.length <= 1, "Every transaction page must honor its bounded size.");
    pageIds.push(...transactionPage.items.map((item) => item.id));
    if (!transactionPage.hasMore || !transactionPage.nextCursor) break;
    const nextPageResponse = await GET(bearerRequest(`${baseUrl}?pageSize=1&challengeCursor=${encodeURIComponent(transactionPage.nextCursor)}`, users["finance-a"].token));
    equal(nextPageResponse.status, 200, "Authorized cursor must load the next organization-scoped page.");
    transactionPage = (await nextPageResponse.json()).data.challengeTransactions;
  }
  equal(new Set(pageIds).size, 8, "Cursor pagination must expose each valid Org A transaction exactly once.");
  equal(pageIds.length, 8, "Cursor pagination must not repeat or omit valid Org A transactions.");
  const invalidCursor = await GET(bearerRequest(`${baseUrl}?challengeCursor=${encodeURIComponent(Buffer.from(`challenge:${runId}_org_b_row`).toString("base64url"))}`, users["finance-a"].token));
  equal(invalidCursor.status, 400, "Foreign or invalid cursor must fail closed.");
  await db.collection("enterpriseFinanceWallets").doc(orgC).set({ organizationId: orgB, pendingBalanceCents: 123456, lifetimeChallengeRevenueCents: 123456 });
  const mismatchedWallet = await GET(bearerRequest(baseUrl, users["finance-corrupt-wallet"].token));
  equal(mismatchedWallet.status, 409, "Conflicting organization wallet attribution must fail closed.");

  const afterCounts = await Promise.all([
    db.collection("challengeFinancialLedger").where("organizationOwnerId", "==", orgA).count().get(),
    db.collection("cashLedger").where("organizationOwnerId", "==", orgA).count().get(),
    db.collection("enterpriseFinanceLedger").where("organizationId", "==", orgA).count().get(),
    db.collection("enterprisePrizeFundingLimits").where("organizationOwnerId", "==", orgA).count().get(),
    db.collection("challengeSettlements").where("enterpriseOrganizationId", "==", orgA).count().get(),
  ]);
  equal(JSON.stringify(afterCounts.map((item) => item.data().count)), JSON.stringify(beforeCounts.map((item) => item.data().count)), "Finance GET must not create or mutate financial records.");
  equal(orgAData.accounting.externalPayoutExecutionEnabled, false, "Finance read has no payout execution capability.");

  console.log(`Enterprise finance actual-handler emulator test passed (${assertions} assertions).`);
} finally {
  await app.delete();
}
