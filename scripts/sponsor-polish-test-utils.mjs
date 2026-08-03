import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

export function runSponsorPolishContract(name) {
  const brand = read("lib/brand-config.ts");
  const logo = read("components/brand/challenge-suite-logo.tsx");
  const layout = read("app/layout.tsx");
  const manifest = read("public/manifest.webmanifest");
  const email = read("lib/server/email.ts");
  const dashboardApi = read("app/api/sponsor/dashboard/route.ts");
  const dashboard = read("app/sponsor/dashboard/page.tsx");
  const sponsorShell = read("components/sponsor/sponsor-shell.tsx");
  const messages = read("app/messages/[conversationId]/page.tsx");
  const messagesApi = read("lib/server/messages.ts");
  const proposalWizard = read("app/sponsor/proposals/new/page.tsx");
  const proposalApi = read("app/api/sponsor/proposals/route.ts");
  const proposalMenu = read("components/sponsor/proposal-actions-menu.tsx");
  const proposalActivity = read("app/api/sponsor/proposals/[proposalId]/activity/route.ts");
  const campaignMenu = read("components/sponsor/campaign-actions-menu.tsx");
  const challengeMenu = read("components/challenge/owned-challenge-actions-menu.tsx");
  const intro = read("app/sponsor/start/page.tsx");
  const onboarding = read("app/sponsor/onboarding/page.tsx");
  const sidebar = read("components/sidebar.tsx");
  const settings = read("app/settings/[section]/page.tsx");
  const sponsorSettings = read("app/sponsor/settings/page.tsx");

  assert.match(brand, /challenge-suite-logo\.png/);
  assert.match(brand, /challenge-suite-logo-transparent_oq72ds\.png/);
  assert.match(logo, /data-challenge-suite-logo/);
  assert.match(logo, /object-contain/);
  assert.match(layout, /manifest: brandConfig\.manifest/);
  assert.match(brand, /manifest\.webmanifest/);
  assert.match(layout, /brandConfig\.logo\.socialCard/);
  assert.match(brand, /challenge-suite-social-card\.png/);
  assert.match(manifest, /maskable/);
  assert.match(email, /CHALLENGE_SUITE_LOGO_URL/);
  assert.match(email, /withChallengeSuiteEmailBranding/);

  assert.match(dashboardApi, /Promise\.allSettled/);
  assert.match(dashboardApi, /widgetErrors/);
  assert.match(dashboard, /greetingName/);
  assert.match(dashboard, /Retry unavailable sections/);
  assert.doesNotMatch(dashboard, /mock|demo sponsor|sample campaign/i);
  assert.match(sponsorShell, /Complete Profile/);
  assert.match(sponsorShell, /Reports/);
  assert.doesNotMatch(sponsorShell, /label: "Inbox"/);

  assert.match(messages, /xl:grid-cols-\[330px_minmax\(0,1fr\)_310px\]/);
  assert.match(messages, /Collaboration details/);
  assert.doesNotMatch(messages, />Fund proposal</i);
  assert.match(messagesApi, /const path = cleanText/);
  assert.match(messagesApi, /url\.startsWith\("https:\/\/"\)/);
  assert.match(messagesApi, /getConversation\(db, input\.conversationId, input\.senderId\)/);

  assert.match(proposalWizard, /Proposal Basics/);
  assert.match(proposalWizard, /Recipient & Opportunity/);
  assert.match(proposalWizard, /Budget & Payment Style/);
  assert.match(proposalWizard, /Deliverables & Brand Requirements/);
  assert.match(proposalWizard, /Review & Send/);
  assert.doesNotMatch(proposalWizard, /label="(?:Creator|Challenge|Campaign) ID"/i);
  assert.match(proposalWizard, /milestone_payment/);
  assert.match(proposalWizard, /deliverables/);
  assert.match(proposalApi, /fundingStatus: "not_active"/);

  assert.match(proposalMenu, /MoreVertical/);
  assert.match(proposalMenu, /window\.confirm/);
  assert.match(proposalMenu, /"archived"/);
  assert.match(proposalActivity, /assertSponsorOwnedDoc/);
  assert.match(proposalActivity, /PROPOSAL_REMINDER_UNAVAILABLE/);
  assert.match(campaignMenu, /MoreVertical/);
  assert.match(campaignMenu, /window\.confirm/);
  assert.match(challengeMenu, /Open challenge actions/);

  assert.match(sidebar, /href="\/sponsor\/start"/);
  assert.doesNotMatch(intro, /SponsorShell/);
  assert.match(intro, /Start Sponsor Profile/);
  assert.match(onboarding, /pending review/i);
  assert.match(sponsorShell, /if \(!workspace\.approved\)/);
  assert.match(settings, /setAppTheme/);
  assert.match(sponsorSettings, /\/settings\/appearance/);
  assert.doesNotMatch(read("components/public-site/public-shell.tsx"), /ThemeToggle|setTheme|useTheme/);

  assert.match(read("app/api/sponsor/proposals/[proposalId]/route.ts"), /assertSponsorOwnedDoc/);
  assert.match(read("app/api/sponsor/campaigns/[campaignId]/route.ts"), /assertSponsorOwnedDoc/);
  assert.match(read("app/api/messages/[conversationId]/route.ts"), /requireRequestUser/);
  assert.match(read("app/api/messages/[conversationId]/route.ts"), /listMessages\(db, conversationId, user\.uid\)/);
  assert.doesNotMatch([dashboard, messages, proposalWizard].join("\n"), /fake sponsor|fake proposal|fake conversation/i);
  console.log(`PASS ${name}`);
}
