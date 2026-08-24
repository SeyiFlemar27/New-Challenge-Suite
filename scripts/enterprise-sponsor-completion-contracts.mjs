import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const enterpriseApi = read("app/api/enterprise-inquiries/route.ts");
const adminApi = read("app/api/admin/operations/route.ts");
const walletFunding = read("lib/server/monetization-payments.ts");
const reservation = read("app/api/sponsor/wallet/fund-campaign-foundation/route.ts");
const addFunds = read("app/api/sponsor/wallet/add-funds/route.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const deliverables = read("app/api/sponsor/deliverables/route.ts") + read("app/api/sponsor/deliverables/[deliverableId]/route.ts");
const reports = read("app/api/sponsor/reports/route.ts");
const analytics = read("app/api/sponsor/analytics/route.ts");
const notifications = read("app/api/sponsor/notifications/route.ts");
const sponsorships = read("app/api/sponsor/sponsorships/route.ts") + read("app/sponsor/sponsorships/page.tsx");
const proposalBuilder = read("app/sponsor/proposals/new/page.tsx");
const proposalApi = read("app/api/sponsor/proposals/route.ts") + read("app/api/sponsor/proposals/[proposalId]/route.ts");
const proposalCollaboration = read("lib/sponsor-collaboration.ts") + read("app/api/creator/sponsorship-proposals/[proposalId]/route.ts");
const sponsorOrganizations = read("lib/server/sponsor-organizations.ts");
const capacity = read("lib/server/sponsor-capacity.ts") + reservation;
const creatorDeliverables = read("app/api/creator/sponsorship-deliverables/route.ts") + read("app/api/creator/sponsorship-deliverables/[deliverableId]/route.ts") + read("app/creator/sponsorships/page.tsx");
const reportDetail = read("app/api/sponsor/reports/[reportId]/route.ts") + read("app/sponsor/reports/[reportId]/page.tsx") + read("lib/server/simple-pdf.ts");
const sponsorshipLifecycle = read("app/api/sponsor/sponsorships/[sponsorshipId]/route.ts") + read("app/sponsor/sponsorships/[sponsorshipId]/page.tsx");
const enterpriseOnboarding = read("lib/enterprise-onboarding.ts") + read("app/api/enterprise/onboarding/route.ts");

export function runCompletionContract(name) {
  if (name === "enterprise-versioned-lifecycle") {
    for (const value of ["ENTERPRISE_APPLICATION_REVISION_COLLECTION", "expectedVersion", "STALE_APPLICATION_VERSION", "reviewAttempt", 'action === "withdraw"', "runTransaction"]) assert.ok(enterpriseApi.includes(value), `missing ${value}`);
    assert.ok(adminApi.includes("reviewedRevision"));
    assert.ok(adminApi.includes('existingWorkspaces.add("enterprise")'));
  } else if (name === "sponsor-provider-confirmed-wallet") {
    for (const value of ["createPendingSponsorWalletFunding", "confirmSponsorWalletFunding", "providerConfirmed: true", "availableBalanceCents: FieldValue.increment", "expireSponsorWalletFunding"]) assert.ok(walletFunding.includes(value), `missing ${value}`);
    assert.ok(addFunds.includes("getRequestIdempotencyKey"));
    assert.ok(addFunds.includes('checkoutMetadataForPurpose("sponsor_wallet_funding"'));
    assert.ok(webhook.includes("confirmSponsorWalletFunding"));
  } else if (name === "sponsor-atomic-full-reservation") {
    for (const value of ["runTransaction", "proposalFundingEligible", "INSUFFICIENT_FUNDS", "availableBalanceCents - amountCents", "reservedFundsCents", "transaction.create(sponsorshipRef", 'status: "converted_to_sponsorship"', "externalPayoutExecuted: false"]) assert.ok(reservation.includes(value), `missing ${value}`);
    assert.ok(!reservation.includes("partialAmount"));
  } else if (name === "sponsor-organization-owned-operations") {
    for (const source of [deliverables, reports, analytics]) {
      assert.ok(source.includes("context.sponsorId"));
      assert.ok(!source.includes('.where("sponsorId", "==", context.user.uid)'));
    }
    assert.ok(deliverables.includes("DELIVERABLE_VERSION_CONFLICT"));
  } else if (name === "sponsor-shared-notifications") {
    assert.ok(notifications.includes("listUserNotifications"));
    assert.ok(!notifications.includes('collection("sponsorNotifications")'));
    assert.ok((sponsorOrganizations + creatorDeliverables).includes('collection("sponsorMemberships")'));
    assert.ok(!(sponsorOrganizations + creatorDeliverables).includes('collection("sponsorOrganizationMembers")'));
  } else if (name === "sponsor-canonical-sponsorships") {
    assert.ok(sponsorships.includes('collection("sponsorships")'));
    assert.ok(sponsorships.includes("acceptedRevisionId"));
    assert.ok(sponsorships.includes("funded sponsorships"));
  } else if (name === "sponsor-proposal-autosave") {
    for (const value of ['action: "save_draft"', "expectedVersion", "window.setTimeout", "proposalId", "setSent(true)", "immutable: true"]) assert.ok((proposalBuilder + proposalApi).includes(value), `missing ${value}`);
    assert.ok(proposalBuilder.includes("if (sent"));
    assert.ok(proposalCollaboration.includes("proposalIsExpired"));
    for (const value of ["sponsorRole", "sponsorCategory", "categoryExclusive", "requestedPlacements"]) assert.ok(proposalCollaboration.includes(value), `missing immutable counter term ${value}`);
  } else if (name === "sponsor-placement-capacity") {
    for (const value of ["PRIMARY_SPONSOR_UNAVAILABLE", "SPONSOR_CATEGORY_EXCLUSIVE", "SPONSOR_PLACEMENT_FULL", "sponsorChallengeOccupancy", "runTransaction", "categoryExclusive", "requestedPlacements"]) assert.ok(capacity.includes(value), `missing ${value}`);
  } else if (name === "sponsor-deliverable-lifecycle") {
    for (const value of ["sponsorDeliverables", "sponsorDeliverableRevisions", 'status: "submitted"', "DELIVERABLE_VERSION_CONFLICT", "changes_requested", "sponsor_deliverable_submitted", "relatedCreatorId"]) assert.ok((reservation + deliverables + creatorDeliverables).includes(value), `missing ${value}`);
  } else if (name === "sponsor-final-report-pdf") {
    for (const value of ["immutable: true", "verified_canonical_snapshot", "buildTextPdf", "application/pdf", "SPONSORSHIP_NOT_COMPLETE", "Final Report", "Export PDF"]) assert.ok((reports + reportDetail + sponsorships).includes(value), `missing ${value}`);
  } else if (name === "sponsor-cancellation-dispute") {
    for (const value of ["request_cancellation", "report_issue", "sponsorDisputes", "pending_admin_review", "refunded_to_sponsor_wallet", "externalRefundExecuted: false", "releaseSponsorCapacity", "DISPUTE_WINDOW_CLOSED"]) assert.ok(sponsorshipLifecycle.includes(value), `missing ${value}`);
  } else if (name === "enterprise-dynamic-onboarding") {
    for (const value of ["ENTERPRISE_ONBOARDING_DEFINITION_VERSION", "permissionFingerprint", "completionHistory", "audited_action", "automaticallyCompletedTaskIds", "enterprise_staff_assigned"]) assert.ok(enterpriseOnboarding.includes(value), `missing ${value}`);
  } else throw new Error(`Unknown completion contract: ${name}`);
  console.log(`PASS ${name}`);
}
