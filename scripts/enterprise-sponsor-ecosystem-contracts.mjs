import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const includesAll = (source, values, label) => values.forEach((value) => assert.ok(source.includes(value), `${label}: missing ${value}`));

export function runEnterpriseSponsorEcosystemContract(name) {
  const workspace = read("app/api/auth/workspace/route.ts");
  const bootstrap = read("app/api/auth/profile/bootstrap/route.ts");
  const sponsorOrganizations = read("lib/server/sponsor-organizations.ts");
  const sponsorServer = read("lib/server/sponsor.ts");
  const sponsorShell = read("components/sponsor/sponsor-shell.tsx");
  const sidebar = read("components/sidebar.tsx");
  const sponsorOnboarding = read("app/sponsor/onboarding/page.tsx");
  const enterpriseOnboarding = read("lib/enterprise-onboarding.ts");
  const enterpriseOnboardingRoute = read("app/api/enterprise/onboarding/route.ts");
  const proposalBuilder = read("app/sponsor/proposals/new/page.tsx");
  const proposalRoute = read("app/api/sponsor/proposals/[proposalId]/route.ts");
  const proposalCreate = read("app/api/sponsor/proposals/route.ts");
  const revisionRoute = read("app/api/sponsor/proposals/[proposalId]/revisions/route.ts");
  const creatorCounterpart = read("app/api/creator/sponsorship-proposals/[proposalId]/route.ts");
  const funding = read("app/api/sponsor/wallet/fund-campaign-foundation/route.ts");
  const creatorDirectory = read("app/api/sponsor/discover/creators/route.ts");
  const challengeDirectory = read("app/api/sponsor/discover/challenges/route.ts");

  if (name === "additive-workspaces") {
    includesAll(workspace, ['workspace !== "sponsor"', "sponsorAvailable", "SPONSOR_ACCESS_REQUIRED"], name);
    includesAll(bootstrap, ['const accountType = isAdmin ? "admin" : "user"', 'const compatibilityAccountType = "user"', "sponsorOrganizationId"], name);
    assert.ok(!bootstrap.includes('const accountType = isAdmin ? "admin" : "sponsor"'), `${name}: Sponsor must not replace Personal identity`);
  } else if (name === "organization-membership") {
    includesAll(sponsorOrganizations, ["sponsorOrganizations", "sponsorMemberships", "SPONSOR_MEMBERSHIP_ROLES", "SPONSOR_PERMISSIONS"], name);
    includesAll(sponsorServer, ["resolveSponsorOrganizationAccess", "sponsorId:", "requireSponsorPermission"], name);
  } else if (name === "sponsor-navigation") {
    includesAll(sponsorShell, ['label: "Sponsor Studio"', 'label: "Discover"', 'label: "Saved"', 'label: "Sponsorships"', 'label: "Proposals"', 'label: "Deliverables"', 'label: "Analytics"', 'label: "Reports"', 'label: "Wallet"', 'label: "Settings"', 'label: "Support"', "WorkspaceSwitcher"], name);
    assert.ok(!sponsorShell.includes('label: "Campaigns"'), `${name}: Campaigns must not be a sidebar label`);
  } else if (name === "enterprise-shell-isolation") {
    includesAll(sidebar, ["personalEconomyContext", 'workspaceContext === "enterprise"', "Enterprise Access"], name);
    assert.match(sidebar, /personalEconomyContext \? <Link href="\/dorocoins"/);
  } else if (name === "enterprise-dynamic-onboarding") {
    includesAll(enterpriseOnboarding, ["enterpriseOnboardingModules", "access.permissions.includes", "assignment_context", "Having no assignment does not block onboarding"], name);
    includesAll(enterpriseOnboardingRoute, ["completedTaskIds", "runTransaction", "enterpriseOnboarding", "state.completed"], name);
  } else if (name === "sponsor-seven-step-onboarding") {
    includesAll(sponsorOnboarding, ["Audience Preferences", "Workflow Preferences", "Review & Submit", "preferredAudienceSize", "preferredCampaignDuration"], name);
    const steps = sponsorOnboarding.match(/const steps = \[(.*?)\] as const;/s)?.[1] ?? "";
    assert.equal((steps.match(/"/g) ?? []).length / 2, 7, `${name}: expected exactly seven steps`);
  } else if (name === "proposal-nine-step-builder") {
    includesAll(proposalBuilder, ["Scope & Objectives", "Budget & Funding", "Timeline & Milestones", "Brand & Usage Rights", "Prize Contribution is 100% winner-directed"], name);
    const steps = proposalBuilder.match(/const steps = \[(.*?)\] as const;/s)?.[1] ?? "";
    assert.equal((steps.match(/"/g) ?? []).length / 2, 9, `${name}: expected exactly nine steps`);
  } else if (name === "proposal-immutable-revisions") {
    includesAll(proposalCreate, ["batch.create(revisionRef", "immutable: true", "activeRevisionId", "revisionNumber: 1"], name);
    includesAll(revisionRoute, ["runTransaction", "expectedVersion", "PROPOSAL_VERSION_CONFLICT", "sponsorAcceptedRevisionId: null", "creatorAcceptedRevisionId: null", "immutable: true"], name);
  } else if (name === "proposal-double-acceptance") {
    includesAll(proposalRoute, ["sponsorAcceptedRevisionId", "creatorAcceptedRevisionId", 'next.status = bothAccepted ? "accepted" : "negotiating"', 'next.fundingStatus = bothAccepted ? "eligibility_review_required" : "not_active"'], name);
    includesAll(creatorCounterpart, ["creatorAcceptedRevisionId", "sponsorAcceptedRevisionId", "PROPOSAL_VERSION_CONFLICT"], name);
  } else if (name === "creator-counterpart-authorization") {
    includesAll(creatorCounterpart, ["requireRequestUser", "creatorCanAccess", "PERMISSION_DENIED", "request_changes", "counter", "accept", "decline"], name);
  } else if (name === "funding-gated-no-movement") {
    includesAll(funding, ["proposalFundingEligible", "PROPOSAL_NOT_FUNDING_ELIGIBLE", "providerConfirmationRequired: true", "clientPaymentStatusTrusted: false", "moneyMovement: false"], name);
  } else if (name === "prize-contribution-isolated") {
    includesAll(proposalBuilder, ["prizeContribution", "creatorSponsorship", "platformFee", "100% winner-directed"], name);
    includesAll(proposalCreate, ["prizeContributionCents", "creatorSponsorshipCents", "platformFeeCents"], name);
  } else if (name === "directories-36-per-page") {
    [creatorDirectory, challengeDirectory].forEach((source) => includesAll(source, ["const pageSize = 36", '.get("page")', "totalPages", ".slice((page - 1) * pageSize, page * pageSize)"], name));
  } else {
    throw new Error(`Unknown enterprise/sponsor ecosystem contract: ${name}`);
  }
  console.log(`PASS ${name}`);
}
