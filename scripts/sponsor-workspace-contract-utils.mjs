import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));
const files = {
  shell: "components/sponsor/sponsor-shell.tsx",
  dashboard: "app/sponsor/dashboard/page.tsx",
  dashboardApi: "app/api/sponsor/dashboard/route.ts",
  access: "lib/sponsor-access.ts",
  onboarding: "app/sponsor/onboarding/page.tsx",
  profileApi: "app/api/sponsor/profile/route.ts",
  campaigns: "components/sponsor/sponsor-campaign-builder.tsx",
  campaignModel: "lib/sponsor-campaigns.ts",
  campaignApi: "app/api/sponsor/campaigns/route.ts",
  discover: "app/sponsor/discover/page.tsx",
  creatorsApi: "app/api/sponsor/discover/creators/route.ts",
  challengesApi: "app/api/sponsor/discover/challenges/route.ts",
  proposals: "app/sponsor/proposals/page.tsx",
  proposalDetail: "app/sponsor/proposals/[proposalId]/page.tsx",
  proposalApi: "app/api/sponsor/proposals/route.ts",
  proposalDetailApi: "app/api/sponsor/proposals/[proposalId]/route.ts",
  proposalModel: "lib/sponsor-collaboration.ts",
  inbox: "app/sponsor/messages/page.tsx",
  billing: "components/sponsor/sponsor-finance-pages.tsx",
  plans: "app/sponsor/plans/page.tsx",
  billingApi: "app/api/sponsor/billing/route.ts",
  reports: "components/sponsor/sponsor-operations-pages.tsx",
  settings: "app/sponsor/settings/page.tsx",
  support: "app/sponsor/support/page.tsx",
  fundingApi: "app/api/sponsor/challenges/[id]/funding-checkout/route.ts"
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const hasAll = (text, values, message) => { for (const value of values) assert(text.includes(value), `${message}: ${value}`); };

export function runSponsorWorkspaceContract(name) {
  switch (name) {
    case "functional-routes":
      for (const route of ["app/sponsor/dashboard/page.tsx", "app/sponsor/onboarding/page.tsx", "app/sponsor/campaigns/page.tsx", "app/sponsor/discover/page.tsx", "app/sponsor/proposals/page.tsx", "app/sponsor/billing/page.tsx", "app/sponsor/reports/page.tsx", "app/sponsor/settings/page.tsx", "app/sponsor/support/page.tsx"]) assert(exists(route), `Missing sponsor route: ${route}`);
      break;
    case "sidebar-simplified":
      hasAll(source.shell, ["Sponsor Studio", "Discover", "Saved", "Sponsorships", "Proposals", "Deliverables", "Analytics", "Reports", "Wallet", "Settings", "Support", "Brand Profile", "Connected Channels", "Plan &amp; Billing"], "Sponsor navigation missing item");
      assert(!source.shell.includes('label: "Inbox"'), "Sponsor navigation must use the global message entry point instead of a separate Inbox item.");
      assert(!source.shell.includes('label: "Assets"') && !source.shell.includes('label: "Team"'), "Primary sponsor navigation must stay simplified.");
      break;
    case "no-dorocoin-navigation":
      assert(!/DoroCoin|Spin Credits/i.test(source.shell), "Sponsor navigation must not expose DoroCoin or Spin Credits.");
      break;
    case "plans-billing-merged":
      hasAll(source.billing, ["Current Plan", "Payment Methods", "Sponsor Funds", "Invoices & Receipts", "Billing History"], "Billing & Plan missing tab");
      assert(source.shell.includes("Plan &amp; Billing") && !source.shell.includes('label: "Billing & Plan"') && !source.shell.includes('label: "Plans"'), "Plan and billing must remain in the Sponsor footer menu, not primary navigation.");
      break;
    case "state-canonical":
      hasAll(source.access, ["resolveSponsorWorkspaceState", '"draft"', '"submitted"', '"pending_review"', '"needs_changes"', '"approved"', '"rejected"', '"suspended"', "calculateSponsorCompletion"], "Canonical sponsor resolver incomplete");
      assert(source.shell.includes("resolveSponsorWorkspaceState") && source.dashboard.includes("resolveSponsorWorkspaceState"), "Shell and dashboard must share canonical sponsor state.");
      break;
    case "dashboard-simple-kpis":
      hasAll(source.dashboard, ["Active Campaigns", "Open Proposals", "Unread Messages", "Available Sponsor Funds"], "Dashboard KPI missing");
      assert((source.dashboard.match(/<Metric /g) || []).length === 4, "Dashboard should render exactly four main KPI cards.");
      break;
    case "dashboard-widget-level-errors":
      hasAll(source.dashboard, ["Sponsor overview is temporarily unavailable.", "Retry overview", "onClick={() => void load()}"], "Dashboard retry state incomplete");
      break;
    case "onboarding-complete-flow":
      hasAll(source.onboarding, ["Brand Basics", "Connect Your Channels", "Contact Person", "Sponsorship Goals", "Preferred Categories", "Sponsorship Preferences", "Review", "Save & Finish Later", "Submit for Review"], "Onboarding flow incomplete");
      hasAll(source.profileApi, ['reviewAction === "submit" ? "submitted" : "in_progress"', "Sponsor profile submitted for review."], "Onboarding persistence incomplete");
      break;
    case "onboarding-native-uploads":
      hasAll(source.onboarding, ["MediaUploadField", "sponsorMediaPath", "logoPath", "bannerPath", "storage-confirmed file"], "Native sponsor media upload incomplete");
      hasAll(source.profileApi, ["invalidSponsorMediaPath", "authenticated sponsor media path"], "Sponsor upload server validation incomplete");
      break;
    case "campaign-brief-five-step-flow":
      hasAll(source.campaignModel, ["Campaign Basics", "Audience & Goals", "Budget & Sponsorship Type", "Deliverables & Brand Rules", "Review & Submit"], "Campaign brief step missing");
      assert((source.campaignModel.match(/title:/g) || []).length === 5, "Campaign brief must use five steps.");
      assert(source.campaigns.includes("<details") && source.campaigns.includes("submitted_for_review"), "Advanced fields must be collapsible and submit state persisted.");
      break;
    case "discover-creators-challenges-saved":
      hasAll(source.discover, ["Creators", "Challenges", "Saved", "/sponsor/discover/creators", "/sponsor/discover/challenges", "/sponsor/saved"], "Discover hub incomplete");
      hasAll(source.creatorsApi + source.challengesApi, ["SPONSOR_DISCOVERY_LOCKED", "resolveSponsorWorkspaceState"], "Discovery APIs must enforce sponsor approval");
      break;
    case "proposal-complete-flow":
      hasAll(source.proposalModel, ["viewed", "negotiating", "changes_requested", "accepted", "declined", "admin_review", "funding_required", "funded", "live", "completed", "cancelled", "archived"], "Proposal status missing");
      hasAll(source.proposalApi + source.proposalDetailApi, ["SPONSOR_PROPOSAL_LOCKED", "assertSponsorOwnedDoc", "sponsorProposalActivity"], "Proposal server workflow incomplete");
      break;
    case "proposal-long-text-safe":
      assert(source.proposals.includes("break-words") && source.proposalDetail.includes("break-words"), "Proposal list and detail must safely wrap long text.");
      break;
    case "funding-button-eligibility":
      hasAll(source.fundingApi, ["sponsorIsApproved", "hasActiveSponsorSubscription", "Challenge opportunity was not found", "amountCents", "pending", "webhookConfirmationRequired", "contributionConfirmed: false"], "Funding server gate missing");
      assert(!source.inbox.includes("Fund Challenge"), "Inbox must not show context-free funding actions.");
      break;
    case "inbox-contextual-not-crowded":
      hasAll(source.inbox, ['redirect("/messages")'], "Sponsor messages must use the canonical global conversation workspace");
      assert(!source.inbox.includes("Fund Challenge"), "Inbox must keep funding contextual.");
      break;
    case "billing-plan-friendly-provider-states":
      assert((source.billing + source.plans).includes("Plan currently unavailable") && source.billing.includes("friendlyProviderState"), "Billing provider states must be sponsor-friendly.");
      assert(!/Stripe Price Not Configured/i.test(source.billing + source.billingApi), "Raw Stripe configuration copy must not be sponsor-facing.");
      break;
    case "reports-real-data-empty-state":
      hasAll(source.reports, ["No campaign reports yet.", "Reports will appear after your sponsored challenge goes live and activity is recorded.", "/api/sponsor/reports"], "Reports real-data state incomplete");
      const reportPage = source.reports.split("export function SponsorReportsPage")[1]?.split("export function SponsorReportDetailPage")[0] || "";
      assert(!reportPage.includes("Save Draft</Button>") && !reportPage.includes("Prepare report"), "Reports must not create placeholder report drafts.");
      break;
    case "settings-simplified":
      hasAll(source.settings, ["Brand Profile", "Verification", "Billing & Payment", "Team", "Notifications", "Security", "Privacy"], "Settings section missing");
      assert(!source.settings.includes('title: "Integrations"'), "Unavailable integrations must stay hidden.");
      break;
    case "support-ticket-flow":
      hasAll(source.support, ["/api/support/tickets", "/support/new", "Create Support Ticket", "authenticated native upload path", "admin responses"], "Sponsor support flow incomplete");
      break;
    case "route-and-button-functional-qa":
      hasAll(source.shell + source.dashboard + source.discover + source.support, ["/sponsor/dashboard", "/sponsor/onboarding", "/sponsor/campaigns", "/sponsor/discover", "/sponsor/proposals", "/sponsor/billing", "/sponsor/settings", "/sponsor/support"], "Primary sponsor route missing");
      assert(source.shell.includes("!workspace.approved") && source.shell.includes("Complete brand profile") && source.dashboard.includes("Retry overview"), "Locked and retry actions must be explicit.");
      break;
    case "mobile-no-overflow":
      hasAll(source.shell, ["overflow-x-hidden", "md:hidden", "w-[min(90vw,360px)]", "min-w-0", "min-h-11"], "Sponsor mobile shell incomplete");
      break;
    case "access-own-data-only":
      assert(source.dashboardApi.includes('.where("sponsorId", "==", sponsorId)'), "Dashboard must query organization-owned sponsor data.");
      assert(source.proposalDetailApi.includes("assertSponsorOwnedDoc") && source.profileApi.includes("requireRequestUser"), "Sponsor detail/profile authorization missing.");
      break;
    case "unapproved-actions-locked-with-reason":
      hasAll(source.access, ["canDiscover = approved", "canSendProposal = approved", "canFund = canSendProposal", "lockedReason"], "Sponsor eligibility reasons incomplete");
      hasAll(source.campaignApi + source.creatorsApi + source.challengesApi + source.proposalApi, ["SPONSOR_", "resolveSponsorWorkspaceState"], "Server sponsor gates missing");
      break;
    case "no-foundation-wording": {
      const visible = [source.shell, source.dashboard, source.onboarding, source.campaigns, source.discover, source.proposals, source.proposalDetail, source.inbox, source.billing, source.reports, source.settings, source.support].join("\n");
      assert(!/foundation-only|funding checkout foundation|not tracked yet|stripe price not configured/i.test(visible), "Sponsor UI must not expose technical foundation wording.");
      break;
    }
    case "no-fake-data": {
      const relevant = Object.values(source).join("\n");
      assert(!/fakeSponsor|mockSponsor|demo sponsor|fake campaign|fake proposal|fake funds/i.test(relevant), "Sponsor workspace must not add fake production data.");
      assert(source.dashboardApi.includes("sponsorContributions") && source.reports.includes("/api/sponsor/reports"), "Sponsor workspace must read real backend records.");
      break;
    }
    case "premium-light-layout":
      hasAll(source.shell, ["bg-white", "border-slate-200", "text-slate-950", "bg-[var(--background)]"], "Sponsor shell light theme incomplete");
      assert(!source.campaigns.includes("bg-[#111]") && !source.settings.includes("bg-[#171717]"), "Primary sponsor pages must not use inherited dark panels.");
      break;
    case "gold-brand-accent-preserved":
      assert((source.shell.match(/var\(--gold\)/g) || []).length >= 3 && source.dashboard.includes("text-amber-800"), "Sponsor workspace must preserve restrained gold accents.");
      break;
    default:
      throw new Error(`Unknown sponsor workspace contract: ${name}`);
  }
  console.log(`Sponsor workspace ${name} checks passed.`);
}
