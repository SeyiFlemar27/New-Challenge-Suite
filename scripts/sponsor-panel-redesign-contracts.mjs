import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const all = (source, values, label) => values.forEach((value) => assert(source.includes(value), `${label}: missing ${value}`));
export function runSponsorPanelContract(name) {
  const switcher = read("components/workspace-switcher.tsx");
  const topbar = read("components/authenticated-topbar.tsx");
  const shell = read("components/sponsor/sponsor-shell.tsx");
  const studio = read("app/sponsor/dashboard/page.tsx");
  const studioApi = read("app/api/sponsor/dashboard/route.ts");
  const access = read("lib/sponsor-access.ts");
  const org = read("lib/server/sponsor-organizations.ts");
  const sponsorServer = read("lib/server/sponsor.ts");
  const analytics = read("lib/server/sponsor-analytics.ts");
  const analyticsEvent = read("app/api/sponsor/analytics/events/route.ts");
  const analyticsApi = read("app/api/sponsor/analytics/route.ts");
  const placement = read("components/sponsor-placement.tsx");
  const completion = read("lib/server/sponsor-completion.ts");
  const completionRoute = read("app/api/internal/sponsor-completion/route.ts");
  const cron = read("vercel.json");
  const adminRoute = read("app/api/admin/sponsor-operations/route.ts");
  const adminPage = read("app/admin/sponsor-operations/page.tsx");
  const onboarding = read("app/sponsor/onboarding/page.tsx");
  const proposalBuilder = read("app/sponsor/proposals/new/page.tsx");
  const proposalDetail = read("app/sponsor/proposals/[proposalId]/page.tsx");
  if (name === "entry-isolation") {
    assert(!switcher.includes('value: "sponsor"') && !switcher.includes('label: "Sponsor"'), "Sponsor must not be a normal workspace switcher option");
    all(topbar, ["Sponsor Panel", "Become a Sponsor", 'activeWorkspace === "personal"'], name);
    assert(!shell.includes("WorkspaceSwitcher"), "Sponsor Panel must have a dedicated shell");
  } else if (name === "shell-navigation") {
    all(shell, ["Brand Profile", "Connected Channels", "Plan & Billing", "Return to Challenge Suite", "Sign Out", 'label: "Sponsor Studio"', 'label: "Discover"', 'label: "Saved"', 'label: "Sponsorships"', 'label: "Proposals"', 'label: "Deliverables"', 'label: "Analytics"', 'label: "Reports"', 'label: "Wallet"', 'label: "Settings"', 'label: "Support"'], name);
    assert(!shell.includes('label: "Campaigns"') && !shell.includes('label: "Team"') && !shell.includes('label: "Messages"') && !shell.includes("View public site"), "Retired Sponsor navigation must not render");
  } else if (name === "brand-identity") {
    all(shell, ["brandName", "squareIconUrl", "logoUrl", "initials(brandName)", "Sponsor Account"], name);
    assert(!shell.includes("user.photoURL") && !shell.includes("personal avatar"), "Sponsor identity must be brand-derived");
  } else if (name === "studio") {
    all(studio, ["Active Sponsorships", "Open Proposals", "Needs Attention", "Wallet Balance", "Available Sponsor funds only", "Recommended Opportunities", 'useState<"challenges" | "creators">("challenges")'], name);
    assert.equal((studio.match(/<Metric title=/g) ?? []).length, 4, "Studio must render exactly four top metrics");
    all(studioApi, ["buildSponsorAttention", "activeSponsorPreview", "sponsorStudioMetrics", ".slice(0, 4)", "Promise.allSettled", "widgetErrors"], name);
  } else if (name === "access-states") {
    all(access, ['canDiscover = status !== "suspended"', "canSendProposal = approved", "canFund = canSendProposal"], name);
    all(org, ["includeHistorical", 'status: "active" | "restricted" | "suspended" | "closed"', "candidates.sort"], name);
    all(sponsorServer, ["allowHistorical", "includeHistorical: options.allowHistorical === true"], name);
    all(studio, ["Historical records only", "new proposals and funding actions are disabled"], name);
  } else if (name === "retired-v1-surfaces") {
    assert(read("app/sponsor/campaigns/page.tsx").includes('redirect("/sponsor/proposals")'), "Campaign Brief route must redirect");
    assert(read("app/sponsor/team/page.tsx").includes('redirect("/sponsor/settings")'), "Team route must redirect");
    assert(!proposalBuilder.includes("Campaign brief (optional)") && !proposalBuilder.includes("/api/sponsor/campaigns"), "Proposal creation must not depend on Campaign Brief");
    assert(!proposalDetail.includes("Internal Sponsor notes") && !proposalDetail.includes("/api/sponsor/internal-notes"), "Internal Sponsor notes must not be active in v1");
  } else if (name === "manual-channels") {
    all(onboarding, ["Connected channels", "OAuth connections are not available yet", "socialLink1", "socialLink2", "socialLink3", "socialLinks:"], name);
  } else if (name === "analytics-integrity") {
    all(analytics, ["sponsorAnalyticsEventId", "classifySponsorAnalyticsEvent", "reconcileSponsorAnalytics", "invalidEventsExcluded", "finalized", "immutable"], name);
    all(analyticsEvent, ["sponsorAnalyticsEventId", "sessionHash", "classification", "invalidReasons", "deduplicated"], name);
    all(analyticsApi, ["live_provisional", "finalized_available", "trusted_sponsor_placement_events"], name);
  } else if (name === "public-placement") {
    all(placement, ["placement_impression", "cta_click", "/api/sponsor/analytics/events", "Primary Sponsor", "Supporting Sponsor", 'rel="noopener noreferrer sponsored"'], name);
    const challengeApi = read("app/api/challenges/[id]/route.ts");
    all(challengeApi, ["linkedChallengeId", "sponsorProfiles", "placementId", "ctaDestinationLink"], name);
  } else if (name === "completion") {
    all(completion, ["completion_review", "REVIEW_WINDOW_MS", "completionReviewStartedAt", "completionReviewEndsAt", "ensureFinalReport", "Final sponsorship report ready", "autoCompletionWarningSentAt", "open_dispute", "required_deliverables_unresolved", "runTransaction", "sponsorAnalyticsReconciliationQueue"], name);
    all(completionRoute, ["CRON_SECRET", "processSponsorCompletion"], name);
    all(cron, ["/api/internal/sponsor-completion", "0 * * * *"], name);
    all(completion, ["externalPayoutExecuted: false", "externalRefundExecuted: false"], "Completion scheduler external finance safety");
  } else if (name === "admin-operations") {
    all(adminRoute, ["sponsorDisputes", "sponsorCancellationRequests", "sponsorVerification", "requireAdminPermission", "writeAuditLog", "externalPayoutExecuted: false", "externalRefundExecuted: false"], name);
    all(adminPage, ["Sponsorship Operations", "dispute", "cancellation", "verification", "Required operational reason", "Record Decision"], name);
    assert(!adminPage.includes("window.prompt") && !adminPage.includes("window.alert"), "Admin decisions need an accessible in-app panel");
  } else if (name === "no-fake-finance") {
    const source = [studioApi, analytics, analyticsEvent, completion, adminRoute].join("\n");
    assert(!/mockSponsor|fake sponsor|demo sponsor|fake balance|fake payment/i.test(source), "Sponsor implementation must not add fake production records");
    all(adminRoute, ["externalPayoutExecuted: false", "externalRefundExecuted: false"], name);
  } else if (name === "responsive-accessible") {
    all(shell, ["overflow-x-hidden", "md:hidden", "role=\"dialog\"", "aria-modal=\"true\"", "aria-current", "min-h-11"], name);
    all(adminPage, ["role=\"tablist\"", "role=\"dialog\"", "aria-modal=\"true\"", "aria-labelledby"], name);
  } else throw new Error(`Unknown Sponsor Panel contract: ${name}`);
  console.log(`PASS sponsor-panel ${name}`);
}