import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const subscriptions = read("app/subscriptions/page.tsx");
const enterpriseApply = read("app/enterprise/apply/page.tsx");
const enterprisePanel = read("app/enterprise/page.tsx");
const enterpriseApi = read("app/api/enterprise-inquiries/route.ts");
const settingsPage = read("app/settings/page.tsx");
const settingsSection = read("app/settings/[section]/page.tsx");
const builder = read("components/challenge-builder.tsx");
const rewards = read("app/rewards/page.tsx");
const rewardWheel = read("app/rewards/wheel/page.tsx");
const layout = read("app/layout.tsx");
const customizationAccess = read("lib/customization/access.ts");

assert(exists("app/enterprise/apply/page.tsx"), "/enterprise/apply must exist.");
assert(exists("app/enterprise/page.tsx"), "/enterprise panel must exist.");

assert(subscriptions.includes('!["pro", "enterprise"].includes(plan.id)'), "Enterprise must be filtered out of public subscriptions.");
assert(subscriptions.includes("Need Enterprise access?"), "Subscriptions should show a short Enterprise application CTA.");
assert(subscriptions.includes("/enterprise/apply"), "Enterprise CTA should route to /enterprise/apply.");
assert(!subscriptions.includes("Enterprise Partner"), "Sponsor Enterprise Partner must not appear on /subscriptions.");
assert(!subscriptions.includes("Sponsor Starter"), "Sponsor Starter must not appear on /subscriptions.");
assert(!subscriptions.includes("Brand Partner"), "Brand Partner must not appear on /subscriptions.");
assert(!subscriptions.includes("Manage Billing</"), "Manage Billing should not render as a large /subscriptions action.");

assert(enterpriseApply.includes("Enterprise application submitted"), "Enterprise application should have a safe submitted state.");
assert(enterpriseApply.includes("Submitting an application does not guarantee approval."), "Enterprise application must explain manual approval.");
assert(enterpriseApply.includes("Approved users get access to an Enterprise control panel."), "Enterprise application must describe approved panel access.");
assert(!/(Enterprise activated|Payment complete|Welcome email sent|Admin admitted you)/i.test(enterpriseApply), "Enterprise application must not claim approval, payment, or email success.");
assert(enterpriseApi.includes('approvalStatus: "pending"'), "Enterprise API should store pending approval status.");
assert(enterpriseApi.includes("enterpriseAccessGranted: false"), "Enterprise API must not grant access.");
assert(enterpriseApi.includes("emailSent: false"), "Enterprise API must not claim email delivery.");
assert(enterprisePanel.includes("Enterprise access required"), "Enterprise panel should lock access until approval.");
assert(enterprisePanel.includes("approved = false"), "Enterprise panel should not auto-approve users.");
assert(!/(fake|revenue|operators:|Payment complete|Enterprise activated)/i.test(enterprisePanel), "Enterprise panel must not show fake operational data.");

assert(settingsPage.includes("Subscription"), "Settings should expose Subscription.");
assert(settingsSection.includes("Manage Billing - Billing portal setup required"), "Settings Subscription should hold Manage Billing setup-safe action.");
assert(settingsSection.includes("Invoices appear after successful payment"), "Settings Subscription should hold invoice empty state.");

assert(builder.includes("Images"), "Builder upload step must include Images section.");
assert(builder.includes("Image 1"), "Builder upload step must include Image 1.");
assert(builder.includes("Image 2"), "Builder upload step must include Image 2.");
assert(builder.includes("Image 3"), "Builder upload step must include Image 3.");
assert(builder.includes("Video"), "Builder upload step must include Video section.");
assert(builder.includes("Intro video / trailer"), "Builder upload step must include one intro video/trailer upload.");
assert(builder.includes("Add at least one challenge image to continue."), "Builder must require at least one image.");
assert(builder.includes("requiredImageMissing"), "Builder must enforce required image state.");
assert(builder.includes('type="datetime-local"'), "Builder should use a calendar/date input flow.");
assert(!/Documents|document upload/i.test(builder), "Builder must not include document uploads.");
assert(!/(Fiverr|gig|buyer|seller)/i.test(builder), "Builder copy must not use marketplace wording.");

assert(!/Verified Host Shield|Verified Host/.test(builder + settingsPage + settingsSection + customizationAccess), "Verified Host user-facing copy must be removed from touched surfaces.");

assert(rewards.includes("Available Spins"), "Rewards page should use Available Spins naming.");
assert(rewards.includes("No reward activity yet"), "Rewards page should show empty reward activity state.");
assert(!/10,000 points|Awaiting Claim|Basic Spins/.test(rewards), "Rewards page must not show fake points, fake claims, or Basic Spins naming.");
assert(rewardWheel.includes("Available Spin"), "Reward wheel should use Available Spins naming.");
assert(rewardWheel.includes("You need"), "Reward wheel should show threshold lock copy.");
assert(rewardWheel.includes("Not enough points or spins available."), "Reward wheel should show insufficient eligibility copy.");
assert(!/Sound off|Effects on|Prize Set|SpinControls|PrizeLegend|recentResults|Basic Spins/.test(rewardWheel), "Reward wheel must not show old controls, side panels, or fake recent state.");

assert(layout.includes("icons:"), "App metadata should define favicon icons.");
assert(exists("app/icon.tsx"), "App Router icon asset should exist.");

console.log("Platform production polish checks passed.");
