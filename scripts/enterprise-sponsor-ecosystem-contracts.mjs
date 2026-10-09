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
    includesAll(workspace, ['workspace !== "personal" && workspace !== "enterprise"', "sponsorAvailable"], name);
    assert.ok(!workspace.includes('workspace === "sponsor"'), `${name}: Sponsor must not be a switchable workspace`);
    includesAll(bootstrap, ['const accountType = isAdmin ? "admin" : "user"', 'const compatibilityAccountType = "user"', "sponsorOrganizationId"], name);
    assert.ok(!bootstrap.includes('const accountType = isAdmin ? "admin" : "sponsor"'), `${name}: Sponsor must not replace Personal identity`);
  } else if (name === "organization-membership") {
    includesAll(sponsorOrganizations, ["sponsorOrganizations", "sponsorMemberships", "SPONSOR_MEMBERSHIP_ROLES", "SPONSOR_PERMISSIONS"], name);
    includesAll(sponsorServer, ["resolveSponsorOrganizationAccess", "sponsorId:", "requireSponsorPermission"], name);
  } else if (name === "sponsor-navigation") {
    includesAll(sponsorShell, ['Sponsor Panel', 'label: "Dashboard"', 'label: "Discover Opportunities"', 'label: "My Campaigns"', 'label: "Analytics"', 'label: "Wallet"', "Return to Challenge Suite"], name);
    assert.ok(!sponsorShell.includes('href: "/sponsor/proposals/new"') && !sponsorShell.includes('label: "Proposals"') && !sponsorShell.includes("WorkspaceSwitcher"), `${name}: retired proposal creation and the workspace switcher must not appear in Sponsor Panel`);
  } else if (name === "enterprise-shell-isolation") {
    includesAll(sidebar, ["personalEconomyContext", 'routedWorkspace === "enterprise"', "workspaceForRoute"], name);
    assert.ok(!sidebar.includes("Enterprise Access"), `${name}: legacy Enterprise access badge must not replace workspace identity`);
    assert.match(sidebar, /personalEconomyContext \? <Link href="\/dorocoins"/);
  } else if (name === "enterprise-dynamic-onboarding") {
    includesAll(enterpriseOnboarding, ["enterpriseOnboardingModules", "access.permissions.includes", "assignment_context", "Having no assignment does not block onboarding"], name);
    includesAll(enterpriseOnboardingRoute, ["completedTaskIds", "runTransaction", "enterpriseOnboarding", "state.completed"], name);
  } else if (name === "sponsor-seven-step-onboarding") {
    includesAll(sponsorOnboarding, ["Brand Basics", "Connect Your Channels", "Contact Person", "Sponsorship Goals", "Preferred Categories", "Sponsorship Preferences", '"Review"', "preferredAudienceSize", "preferredCampaignDuration"], name);
    const steps = sponsorOnboarding.match(/const steps = \[(.*?)\] as const;/s)?.[1] ?? "";
    assert.equal((steps.match(/"/g) ?? []).length / 2, 7, `${name}: expected exactly seven steps`);
  } else if (name === "proposal-nine-step-builder") {
    includesAll(proposalBuilder, ['redirect("/sponsor/campaigns/create")'], name);
    assert.ok(!proposalBuilder.includes("Proposal Builder"), `${name}: retired builder must not remain active`);
  } else if (name === "proposal-immutable-revisions") {
    includesAll(proposalCreate, ["Historical Sponsor proposal records remain readable", "SPONSOR_PROPOSAL_CREATION_RETIRED", "410"], name);
    includesAll(revisionRoute, ["SPONSOR_PROPOSAL_REVISION_RETIRED", "410"], name);
  } else if (name === "proposal-double-acceptance") {
    includesAll(proposalRoute, ["SPONSOR_PROPOSAL_READ_ONLY", "410"], name);
    includesAll(creatorCounterpart, ["SPONSOR_PROPOSAL_READ_ONLY", "410"], name);
  } else if (name === "creator-counterpart-authorization") {
    includesAll(creatorCounterpart, ["requireRequestUser", "creatorCanAccess", "SPONSOR_PROPOSAL_READ_ONLY", "410"], name);
    assert.ok(!creatorCounterpart.includes("runTransaction") && !creatorCounterpart.includes("transaction.update") && !creatorCounterpart.includes("transaction.create"), `${name}: historical proposal compatibility must not write`);
  } else if (name === "funding-gated-no-movement") {
    includesAll(funding, ["SPONSOR_PROPOSAL_FUNDING_RETIRED", "410"], name);
    assert.ok(!funding.includes("runTransaction") && !funding.includes('collection("sponsorProposals")'), `${name}: historical proposal funding must not mutate financial or proposal records`);
  } else if (name === "prize-contribution-isolated") {
    includesAll(proposalBuilder, ['redirect("/sponsor/campaigns/create")'], name);
    includesAll(proposalCreate, ["SPONSOR_PROPOSAL_CREATION_RETIRED", "410"], name);
  } else if (name === "directories-36-per-page") {
    [creatorDirectory, challengeDirectory].forEach((source) => includesAll(source, ["const pageSize = 36", '.get("page")', "totalPages", ".slice((page - 1) * pageSize, page * pageSize)"], name));
  } else {
    throw new Error(`Unknown enterprise/sponsor ecosystem contract: ${name}`);
  }
  console.log(`PASS ${name}`);
}
