import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const sidebar = read("components/sidebar.tsx");
const switcher = read("components/workspace-switcher.tsx");
const boundary = read("components/workspace-route-boundary.tsx");
const routing = read("lib/workspace-routing.ts");
const shell = read("components/app-shell.tsx");
const topbar = read("components/authenticated-topbar.tsx");
const settings = read("app/settings/page.tsx");
const createPage = read("app/enterprise/challenges/create/page.tsx");
const createEntry = read("components/enterprise/enterprise-create-entry.tsx");
const enterprisePage = read("app/enterprise/page.tsx");
const applyPage = read("app/enterprise/apply/page.tsx");
const enterpriseSection = read("components/enterprise/enterprise-section-page.tsx");
const enterpriseSaved = read("app/enterprise/saved/page.tsx");
const sponsorShell = read("components/sponsor/sponsor-shell.tsx");
const workspaceApi = read("app/api/auth/workspace/route.ts");
const mobileFooter = read("components/mobile-footer.tsx");

assert(shell.includes("<WorkspaceRouteBoundary>"), "AppShell must reconcile workspace and route before rendering authenticated content.");
assert(sidebar.includes("workspaceNavigationContext(pathname, user?.activeWorkspace"), "Sidebar context must use the validated active workspace, not pathname alone.");
assert(sidebar.includes("workspaceForRoute"), "Shared-route shell selection must use the canonical route classifier.");

for (const route of ["/subscriptions", "/wallet", "/dorocoins", "/rewards", "/dashboard", "/settings/billing", "/settings/customization", "/settings/wallet", "/favorites", "/challenges/create"]) {
  assert(routing.includes(route), route + " must be classified as Personal-only.");
}
assert(routing.includes('prefixes: ["/enterprise"]') && routing.includes('requiredWorkspace: "enterprise"'), "Enterprise operational routes must require Enterprise context.");
assert(routing.includes('prefixes: ["/sponsor"]') && routing.includes('requiredWorkspace: "sponsor"'), "Sponsor operational routes must require Sponsor context.");
assert(boundary.includes('method: "PATCH"') && boundary.includes("/api/auth/workspace"), "Cross-workspace route changes must use the canonical server API.");
assert(boundary.includes("window.location.pathname + window.location.search + window.location.hash"), "Personal-only route switches must preserve the exact requested destination.");
assert(boundary.includes('document.querySelector("[data-builder-surface]")') && boundary.includes("window.confirm"), "Cross-workspace routing must preserve the unsaved-work guard.");
assert(switcher.includes('document.querySelector("[data-builder-surface]")') && switcher.includes("window.confirm"), "Explicit workspace switching must preserve the unsaved-work guard.");
assert(workspaceApi.includes("enterpriseAvailable") && workspaceApi.includes("sponsorAvailable"), "Workspace switching must remain server-authorized.");
assert(workspaceApi.includes("resolveActiveWorkspace"), "Last workspace must be restored only after access revalidation.");

const enterpriseStart = sidebar.indexOf("function enterpriseSections");
const enterpriseEnd = sidebar.indexOf("export function workspaceNavigationContext", enterpriseStart);
const enterpriseNavigation = sidebar.slice(enterpriseStart, enterpriseEnd);
for (const label of ["Enterprise Studio", "Explore", "Saved", "Build a Challenge", "Official Challenges", "Assigned to Me", "Submissions", "Reviews", "Analytics", "Finance", "Sponsorships", "Leaderboards", "Winners", "Team", "Activity", "Profile", "Settings"]) {
  assert(enterpriseNavigation.includes(label), "Enterprise navigation missing " + label);
}
for (const forbidden of ["Host Control Center", "Creator Studio", "My Entries", "DoroCoins", "Rewards", "Become a Sponsor", "Host Plan", "Sponsor Wallet"]) {
  assert(!enterpriseNavigation.includes(forbidden), "Enterprise navigation must not include " + forbidden);
}
assert(enterpriseNavigation.includes('allowed("finance.view")') && enterpriseNavigation.includes('allowed("sponsors.view")'), "Sensitive Enterprise navigation must be permission-gated.");
assert(enterpriseNavigation.includes("canCreate ?") && enterpriseNavigation.includes('challenge.create_official') && enterpriseNavigation.includes('challenge.create_personal'), "Build a Challenge must be hidden without creation permission.");
for (const label of ["Normal", "Private", "Live Event", "Tournament"]) assert(enterpriseNavigation.includes('label: "' + label + '"'), "Build a Challenge missing " + label);
assert(sidebar.includes("useState(childRouteActive)") && sidebar.includes("if (childRouteActive) setOpen(true)"), "Build a Challenge must be collapsed by default and expand for an active creation route.");
assert(sidebar.includes('personalEconomyContext ? <Link href="/dorocoins"'), "Personal economy controls must remain available in Personal navigation.");
assert(!sidebar.includes("Enterprise Access</div>"), "Enterprise footer must not render a redundant oversized access badge.");

for (const label of ["Personal Workspace", "Challenge Suite Sponsor", "Challenge Suite Enterprise", "Staff Workspace", "Sponsor Workspace"]) assert(switcher.includes(label), "Workspace switcher missing " + label);
assert(switcher.includes("available.includes(workspace)"), "Switcher must render only server-authorized workspaces.");
assert(switcher.includes("user.displayName") && switcher.includes("user.avatarUrl") && switcher.includes("user.initials"), "Compact footer must use the authenticated human identity.");
assert(switcher.includes('aria-haspopup="menu"') && switcher.includes('role="menuitemradio"'), "Workspace switcher must be keyboard/assistive-technology compatible.");
assert(!switcher.includes("Upgrade") && !switcher.includes("pricing"), "Workspace switcher must not contain plan commerce.");
assert(topbar.includes('personalContext ? <MenuLink href="/subscriptions"') && topbar.includes('personalContext ? <MenuLink href="/settings/payouts"'), "Personal billing actions must not render in Enterprise account menus.");

assert(settings.includes('user?.activeWorkspace === "enterprise"') && settings.includes('item.href !== "/settings/billing"') && settings.includes('item.href !== "/settings/wallet"'), "Enterprise Settings must exclude Personal billing and wallet categories.");
assert(createPage.includes("selectedType") && createPage.includes("searchParams"), "Enterprise type child routes must carry the selected challenge type into ownership selection.");
assert(createEntry.includes("/api/enterprise/workspace") && createEntry.includes("challenge.create_official") && createEntry.includes("challenge.create_personal"), "Ownership selection must be permission-authorized.");
assert(createEntry.includes('visibleTypes = selectedType ?'), "Selected sidebar challenge type must skip duplicate type selection.");
assert(createEntry.includes("/enterprise/challenges/create/official/") && createEntry.includes("/enterprise/challenges/create/personal/"), "Ownership selection must open the canonical selected builder.");

assert(enterprisePage.includes('availableWorkspaces?.includes("enterprise")'), "Approved Enterprise access must suppress application marketing using revalidated workspace access.");
assert(enterprisePage.includes(">Build a Challenge</LinkButton>"), "Enterprise Studio must expose the canonical creation action only through its permission branch.");
assert(applyPage.includes('router.replace("/enterprise")') && applyPage.includes("enterpriseApproved"), "Approved Enterprise users must not see the apply-for-access form.");
assert(enterpriseSection.includes("No work is assigned to you right now."), "Assignment-capable staff need a stable zero-assignment empty state.");
assert(enterpriseSaved.includes("officialChallenge") && enterpriseSaved.includes("Personal favorites stay in Personal Workspace"), "Enterprise Saved must exclude Personal favorites.");
assert(sponsorShell.includes("Sponsor Studio") && sponsorShell.includes("/sponsor/wallet"), "Sponsor navigation and Sponsor Wallet must remain intact.");
assert(sidebar.includes("sectionsForTier") && sidebar.includes("personalEconomyContext"), "Personal workspace navigation and economy controls must remain intact.");
assert(mobileFooter.includes("workspaceForRoute") && mobileFooter.includes("enterpriseFooterSections") && mobileFooter.includes("sponsorFooterSections"), "Mobile footer links must follow the same workspace classifier as desktop navigation.");
assert(mobileFooter.includes("if (loading && !signedOut) return null"), "Mobile footer must not flash Personal links before workspace context loads.");

console.log("Enterprise workspace isolation and navigation contracts passed.");
