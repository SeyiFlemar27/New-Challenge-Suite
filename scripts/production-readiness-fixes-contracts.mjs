import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const source = {
  profile: read("app/profile/page.tsx"),
  profileApi: read("app/api/profile/me/route.ts"),
  identity: read("lib/profile-identity.ts"),
  login: read("app/auth/login/page.tsx"),
  register: read("app/auth/register/page.tsx"),
  i18n: read("lib/i18n/config.ts"),
  i18nProvider: read("components/i18n/i18n-provider.tsx"),
  selector: read("components/i18n/language-selector.tsx"),
  earnings: read("app/earnings/page.tsx"),
  earningsHelp: read("app/help/earnings/page.tsx"),
  builder: read("components/challenge-builder.tsx"),
  createApi: read("app/api/challenges/route.ts"),
  publishApi: read("app/api/challenges/[id]/publish/route.ts"),
  publishReadiness: read("lib/challenge-publish-readiness.ts"),
  readiness: read("lib/server/provider-readiness.ts"),
  statusApi: read("app/api/admin/system-status/route.ts"),
  statusUi: read("components/admin/admin-phase2-workspace.tsx"),
  explore: read("app/api/explore/challenges/route.ts"),
  sponsorReporting: read("lib/server/sponsor-reporting.ts"),
  sponsor: read("components/sponsor/sponsor-finance-pages.tsx"),
  notifications: read("app/settings/[section]/page.tsx"),
  settingsApi: read("app/api/settings/route.ts"),
  creator: read("components/creator/creator-workspace.tsx"),
  hostApi: read("app/api/host/operations/route.ts")
};

function profileChecks() {
  assert(source.profile.includes("profile.user.verified === true"));
  assert(source.profileApi.includes("verified: Boolean(profile.verified ?? user.emailVerified)"));
  assert(source.profileApi.includes("isDemoProfileContent") && source.profileApi.includes("isQaOrDemoRecord"));
  assert(![source.profile, source.profileApi, source.identity].join("\n").includes('"Demo Member"'));
}
function i18nChecks() {
  for (const code of ["en", "fr", "es", "pt"]) assert(source.i18n.includes(`code: "${code}"`));
  for (const phrase of ["First Name", "Last Name", "Email Address", "Confirm Password", "Community Guidelines", "Sign In", "Sign Up"]) assert(source.i18n.includes(`["${phrase}"`));
  assert(source.i18n.includes("Terms of Service") && source.i18n.includes("Privacy Policy"));
  assert(source.login.includes("<LanguageSelector") && source.register.includes("<LanguageSelector"));
  assert(source.login.includes("useLanguage()") && source.register.includes("useLanguage()"));
  assert(!source.register.includes('t("createAccount")') && !source.register.includes('t("signUp")'));
  assert(source.i18n.includes("readableFallback(key)"));
  assert(source.i18nProvider.includes('pathname.startsWith("/admin")'));
  assert(source.i18nProvider.includes("data-user-content"));
  assert(source.selector.includes("localStorage.setItem") && source.selector.includes("document.cookie"));
  assert(source.i18n.includes("readBrowserLanguagePreference") && source.i18n.includes("document.cookie"));
  assert(source.i18nProvider.includes("readBrowserLanguagePreference") && source.selector.includes("readBrowserLanguagePreference"));
  assert(!source.i18nProvider.includes("convertCurrency"));
}

function earningsChecks() {
  assert(source.earnings.includes('href="/help/earnings"'));
  for (const phrase of ["pending review", "Identity verification", "DoroCoins", "Challenge Credits", "Growth Wallet", "Contact Support"]) assert(source.earningsHelp.toLowerCase().includes(phrase.toLowerCase()));
  assert(source.earningsHelp.includes("Provider-confirmed records only"));
  assert(!source.earningsHelp.includes("guaranteed payout"));
}

function mediaChecks() {
  assert(source.readiness.includes("imageLessChallengePublishingAllowed"));
  assert(source.createApi.includes("CHALLENGE_MEDIA_UNAVAILABLE") && source.publishApi.includes("CHALLENGE_MEDIA_UNAVAILABLE"));
  assert(source.createApi.includes('process.env.NODE_ENV === "production"') && source.publishApi.includes('process.env.NODE_ENV === "production"'));
  assert(source.builder.includes("mediaPublicationBlocked") && source.publishReadiness.includes("Please add challenge media before publishing."));
  assert(source.builder.includes("form.coverImageUrl") && source.builder.includes("form.coverImagePath"));
  assert(!source.builder.includes("Media Storage Required") && !source.builder.includes("storage-confirmed challenge image"));
  assert(source.builder.includes("imageLessPublishingAllowed"));
  assert(!source.builder.includes("placeholder is uploaded"));
}

function providerChecks() {
  for (const id of ["payments", "payment_webhook", "identity_verification", "uploads", "payouts", "sponsor_funding", "email", "push", "app_stores"]) assert(source.readiness.includes(`"${id}"`));
  for (const state of ["ready", "missing_configuration", "setup_only", "disabled", "unknown", "requires_manual_verification"]) assert(source.readiness.includes(`"${state}"`));
  assert(source.statusApi.includes("requireAdminPermission") && source.statusApi.includes('"systemDiagnostics.view"'));
  assert(source.statusApi.includes("getProviderReadiness"));
  assert(source.statusUi.includes('mode === "readiness" ? "readiness"'));
  assert(!source.statusUi.includes("ready_for_testing"));
  assert(!source.readiness.includes("privateKey"));
}

function exploreChecks() {
  assert(source.explore.includes('backendAvailable: false'));
  assert(source.explore.includes('reason: "backend_not_configured"'));
  assert(!source.explore.includes('serverUnavailable("Explore'));
  assert(source.explore.includes("realDataOnly: true"));
}

function sponsorChecks() {
  assert(source.sponsor.includes("Signature and funding actions remain disabled"));
  assert(source.sponsor.includes("<Button disabled"));
  assert(source.sponsor.includes("No campaign launch or payment release is activated"));
  assert(!source.sponsor.includes("PDF generated"));
  assert(!source.sponsor.includes("funding succeeded"));
}

function notificationChecks() {
  assert(source.notifications.includes("In-app notifications are active"));
  assert(source.notifications.includes("Email delivery is not active yet"));
  assert(source.notifications.includes("Push delivery is not active yet"));
  assert(source.settingsApi.includes("email: false, push: false, inApp: true"));
  assert(source.settingsApi.includes('deliveryMode: "in_app_only"'));
}

function creatorChecks(name) {
  assert(source.hostApi.includes('related(db, "challengeBoosts", challengeIds)'));
  assert(source.creator.includes("activeBoostIds") && source.creator.includes('view === "history"'));
  assert(source.creator.includes("Not eligible: publish this challenge publicly"));
  assert(!source.creator.includes("Math.random"));
  if (name.includes("sponsor-ready")) {
    assert(source.creator.includes("sponsorRecords") && source.creator.includes('view === "interest"'));
  assert(source.sponsorReporting.includes("roi: null") && source.sponsorReporting.includes('roi: "not_tracked_yet"'));
    assert(source.creator.includes("recorded sponsor inquiries"));
    assert(source.creator.includes("No sponsorship or funding record is created") || source.creator.includes("No boost is created"));
  }
}

export function run(name) {
  if (name.includes("profile") || name.includes("demo-member") || name.includes("verification")) profileChecks();
  if (name.includes("i18n") || name.includes("translation")) i18nChecks();
  if (name.includes("earnings-help") || name.includes("dead-cta")) earningsChecks();
  if (name.includes("challenge-media") || name.includes("challenge-publish") || name.includes("storage-disabled") || name.includes("placeholder-media")) mediaChecks();
  if (name.includes("provider-readiness")) providerChecks();
  if (name.includes("explore-")) exploreChecks();
  if (name.includes("sponsor-contract") || name.includes("sponsor-funding") || name.includes("fake-contract") || name.includes("sponsor-roi")) sponsorChecks();
  if (name.includes("notifications-")) notificationChecks();
  if (name.includes("monthly-boosts") || name.includes("sponsor-ready")) creatorChecks(name);
  if (name.includes("global-")) {
    profileChecks(); i18nChecks(); earningsChecks(); mediaChecks(); providerChecks(); exploreChecks(); notificationChecks();
  }
  if (name.includes("admin-protection")) providerChecks();
  console.log(`PASS ${name}`);
}
