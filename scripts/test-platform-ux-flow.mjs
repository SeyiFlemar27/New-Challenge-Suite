import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const sidebar = read("components/sidebar.tsx");
const builder = read("components/challenge-builder.tsx");
const contactSales = read("app/contact-sales/page.tsx");
const sponsorChallenges = read("app/sponsor/discover/challenges/page.tsx");
const sponsorCreators = read("app/sponsor/discover/creators/page.tsx");
const sponsorPlans = read("app/sponsor/plans/page.tsx");
const sponsorFinance = read("components/sponsor/sponsor-finance-pages.tsx");
const sponsorShell = read("components/sponsor/sponsor-shell.tsx");

const hostStart = sidebar.indexOf("const hostSections");
const sponsorStart = sidebar.indexOf("const sponsorSections");
const activeStart = sidebar.indexOf("function activeNavigationHref");
assert(hostStart >= 0 && sponsorStart > hostStart, "Host sidebar section must exist before sponsor section.");
const hostSection = sidebar.slice(hostStart, sponsorStart);
assert(!hostSection.includes('label: "Create Challenge"'), "Host sidebar must not contain standalone Create Challenge.");
assert(!hostSection.includes('label: "Create Private Challenge"'), "Host sidebar must not contain standalone Create Private Challenge.");
assert(!hostSection.includes('label: "Create Live Event"'), "Host sidebar must not contain standalone Create Live Event.");
assert(!hostSection.includes('label: "Create Tournament"'), "Host sidebar must not contain standalone Create Tournament.");
assert(!hostSection.includes('label: "Create Hybrid"') && !hostSection.includes('Hybrid Competition'), "Hybrid must not be exposed as a standalone host sidebar item.");
for (const label of ['label: "Challenges"', 'label: "Private Challenges"', 'label: "Live Events"', 'label: "Tournaments"']) assert(hostSection.includes(label), `Host sidebar missing ${label}.`);
assert(sidebar.includes('href: "/host/challenges"') && sidebar.includes('href: "/host/private"') && sidebar.includes('href: "/host/live-events"') && sidebar.includes('href: "/host/tournaments"'), "Host sidebar must route to management pages.");

assert(existsSync(join(root, "app/host/challenges/page.tsx")), "Host Challenges page must exist.");
assert(existsSync(join(root, "app/host/private/page.tsx")), "Host Private Challenges page must exist.");
assert(existsSync(join(root, "app/host/live-events/page.tsx")), "Host Live Events page must exist.");
assert(existsSync(join(root, "app/host/tournaments/page.tsx")), "Host Tournaments page must exist.");

for (const phrase of ["Cover image", "Promo flyer / poster", "Intro video / trailer", "Browse cover image", "Browse promo asset", "Browse trailer video"]) assert(builder.includes(phrase), `Builder upload step missing ${phrase}.`);
assert(builder.includes("UploadGallery") && builder.includes("MediaBrandingStep"), "Builder upload style must be shared between public and private builders.");
assert(!/(Fiverr|gig|buyer|seller)/i.test(builder), "Builder copy must not use marketplace wording.");

for (const field of ["Full name", "Work email", "Company / organization", "Website", "Role / position", "Expected usage", "Team size", "Budget range", "Message"]) assert(contactSales.includes(field), `Enterprise form missing ${field}.`);
for (const removed of ["Expected monthly challenge volume", "Live event needs", "Sponsor / brand needs"]) assert(!contactSales.includes(removed), `Enterprise form still contains removed field: ${removed}.`);
assert(!/fake payment link|receipt sent|welcome email sent|workspace activated/i.test(contactSales), "Enterprise page must not claim fake payment or email automation.");

assert(sponsorChallenges.includes("sponsor-discovery-list") && sponsorCreators.includes("sponsor-discovery-list"), "Sponsor discovery pages must use list-style layout markers.");
assert(!sponsorChallenges.includes("xl:grid-cols-3") && !sponsorCreators.includes("xl:grid-cols-3"), "Sponsor discovery pages should not use messy card grids.");
assert(!sponsorPlans.includes("Comparison") && !sponsorPlans.includes("comparisonRows") && !sponsorPlans.includes("faq"), "Sponsor plans page must not include long comparison or FAQ sections.");
assert(sponsorPlans.includes("Sponsor subscriptions unlock platform tools. Campaign budgets and prize contributions are handled separately."), "Sponsor plans must include concise budget separation note.");
assert(sponsorFinance.includes("Billing and invoices") && sponsorFinance.includes("Invoices") && sponsorFinance.includes("No invoices yet"), "Billing page must include an invoices tab and empty state.");
assert(!sponsorFinance.includes("fake invoice") && !sponsorFinance.includes("Download PDF</Button>"), "Billing UX must not show fake downloads on main billing page.");
assert(!sponsorShell.includes('label: "Milestones"') && !sponsorShell.includes('label: "Templates"'), "Sponsor sidebar should not promote milestone/template clutter.");

console.log("Platform UX flow checks passed.");
