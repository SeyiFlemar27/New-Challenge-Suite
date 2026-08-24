import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}
function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}
function assertNotIncludes(text, needle, message) {
  assert(!text.includes(needle), message || `does not include ${needle}`);
}
function assertIncludes(text, needle, message) {
  assert(text.includes(needle), message || `includes ${needle}`);
}

const subscriptions = read("app/subscriptions/page.tsx");
const sidebar = read("components/sidebar.tsx");
const onboarding = read("app/sponsor/onboarding/page.tsx");
const sponsorPlans = read("app/sponsor/plans/page.tsx");
const sponsorFoundation = read("lib/sponsor-foundation.ts");
const sponsorDashboard = read("app/sponsor/dashboard/page.tsx");
const sponsorFeature = read("app/sponsor/[feature]/page.tsx");

assertNotIncludes(subscriptions, "Sponsor Starter", "/subscriptions does not show Sponsor Starter");
assertNotIncludes(subscriptions, "Brand Partner", "/subscriptions does not show Brand Partner");
assertNotIncludes(subscriptions, "Enterprise Partner", "/subscriptions does not show Enterprise Partner");
assertNotIncludes(subscriptions, "Sponsors & Brands", "/subscriptions does not show Sponsors & Brands toggle");
assertNotIncludes(subscriptions, "Sponsor & Brands", "/subscriptions does not show Sponsor & Brands toggle");
assertNotIncludes(subscriptions, "Brand Command Center", "/subscriptions does not sell sponsor dashboard access");
assertIncludes(subscriptions, "plan.audience === \"user\"", "/subscriptions filters normal user plans");
assertIncludes(subscriptions, 'plan.id === "free"', "/subscriptions supports Free plan content");
assertIncludes(subscriptions, 'plan.id === "host"', "/subscriptions supports Host plan content");
assertIncludes(subscriptions, '!["pro", "enterprise"].includes(plan.id)', "/subscriptions keeps Creator public while excluding pro and enterprise public cards");
assertIncludes(subscriptions, "Need Enterprise access?", "/subscriptions supports Enterprise application access");

assertIncludes(sidebar, "Become a Sponsor", "account/profile navigation includes Become a Sponsor");
assertIncludes(sidebar, "/sponsor/start", "Become a Sponsor routes to the sponsor start flow");

assertIncludes(onboarding, "Brand Basics", "sponsor onboarding starts with brand basics step");
assertIncludes(onboarding, '"Review"', "sponsor onboarding includes review step");
assertIncludes(onboarding, "Brand / organization name", "sponsor onboarding has brand organization field");
assertIncludes(onboarding, "Business email", "sponsor onboarding has business email field");
assertIncludes(onboarding, "Website", "sponsor onboarding has website field");
assertIncludes(onboarding, "Industry", "sponsor onboarding has industry field");
assertIncludes(onboarding, "Location", "sponsor onboarding has location field");
assertIncludes(onboarding, "Contact person", "sponsor onboarding has contact person field");
assertIncludes(onboarding, "Sponsorship goal", "sponsor onboarding has sponsor goal field");
assertIncludes(onboarding, "Preferred sponsorship type", "sponsor onboarding has sponsorship type field");
assertIncludes(onboarding, "Brand description", "sponsor onboarding has brand description field");
assertIncludes(onboarding, "Save & Finish Later", "sponsor onboarding supports saving progress");
assertIncludes(onboarding, "Submit for Review", "sponsor onboarding explains review submission");
assertIncludes(onboarding, "activate funding", "sponsor onboarding does not imply funding activation");
assertIncludes(onboarding, "It does not alter your Personal account, activate funding, or approve the brand.", "onboarding does not claim fake automation");
assertNotIncludes(onboarding, "Payment completed", "onboarding does not claim payment completed");
assertNotIncludes(onboarding, "Brand approved", "onboarding does not claim brand approved");
assertNotIncludes(onboarding, "Email sent", "onboarding does not claim email sent");
assertNotIncludes(onboarding, "Sponsor tools unlocked", "onboarding does not claim sponsor tools unlocked");

assertIncludes(sponsorPlans, "sponsorPlanCards", "/sponsor/plans renders sponsor plan cards from sponsor source");
assertIncludes(sponsorFoundation, "Sponsor Starter", "sponsor plan source keeps Sponsor Starter");
assertIncludes(sponsorFoundation, "Brand Partner", "sponsor plan source keeps Brand Partner");
assertIncludes(sponsorFoundation, "Enterprise Partner", "sponsor plan source keeps Enterprise Partner");
assertIncludes(sponsorDashboard, "Locked until requirements are met", "sponsor dashboard explains locked payment readiness");
assertIncludes(sponsorDashboard, "workspace.nextActionHref", "sponsor dashboard uses canonical next action routing");
assertIncludes(sponsorFeature, "href=\"/sponsor/plans\"", "sponsor feature gates point plan CTAs to sponsor plans");
assertNotIncludes(sponsorFeature, "href=\"/subscriptions\"", "sponsor feature gates do not route sponsor plan locks to normal subscriptions");

const forbiddenBackendStarts = [
  "stripe.checkout.sessions.create",
  "constructEvent(",
  "sendEmail(",
  "admin.firestore().collection(\"sponsorApprovals\")",
  "brand approved automatically",
  "payment link generated"
];
for (const needle of forbiddenBackendStarts) {
  assertNotIncludes(onboarding, needle, `no full backend sponsor automation marker: ${needle}`);
}

if (process.exitCode) process.exit(process.exitCode);



