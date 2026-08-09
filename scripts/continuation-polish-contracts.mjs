import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const source = {
  config: read("lib/i18n/config.ts"), provider: read("components/i18n/i18n-provider.tsx"), selector: read("components/i18n/language-selector.tsx"), languageApi: read("app/api/profile/language/route.ts"), providers: read("app/providers.tsx"),
  analytics: read("components/creator/creator-analytics.tsx"), workspace: read("components/creator/creator-workspace.tsx"), talent: read("components/public-site/for-talent-experience.tsx"), ambassador: read("components/public-site/ambassador-video-scroll.tsx"),
  profile: read("app/profile/page.tsx"), identity: read("lib/profile-identity.ts"), profileApi: read("app/api/profile/me/route.ts"), bootstrap: read("app/api/auth/profile/bootstrap/route.ts"), social: read("lib/server/social-profile.ts"), publicProfile: read("lib/server/public-profile.ts")
};

export function run(name) {
  if (name.startsWith("i18n-")) {
    for (const code of ["en", "fr", "es", "pt"]) assert(source.config.includes(`code: "${code}"`));
    assert(source.config.includes('DEFAULT_LANGUAGE: LanguageCode = "en"'));
    assert(source.providers.includes("I18nProvider") && source.provider.includes("MutationObserver"));
    assert(source.provider.includes('pathname.startsWith("/admin")'));
    assert(source.provider.includes("data-user-content") && source.provider.includes("data-admin-ui"));
    assert(source.selector.includes("localStorage.setItem") && source.selector.includes("document.cookie"));
    assert(source.languageApi.includes("export async function GET") && source.languageApi.includes("export async function PATCH"));
    assert(!source.provider.includes("/fr/") && !source.provider.includes("/es/") && !source.provider.includes("/pt/"));
    assert(source.config.includes("readableFallback(key)"));
    assert(!source.config.includes("exchangeRate") && !source.config.includes("convertCurrency"));
  }
  if (name.startsWith("creator-analytics-")) {
    for (const marker of ["data-analytics-filter-row", "data-analytics-primary-metrics", "data-analytics-large-trend", "data-analytics-performance-chart"]) assert(source.analytics.includes(marker));
    for (const label of ["Participants", "Submissions", "Recorded Votes", "Sponsor Interest", "Challenge Activity Trend", "Challenge Performance"]) assert(source.analytics.includes(label));
    assert(source.workspace.includes('/api/host/operations'));
    assert(source.analytics.includes("Preview sample data") && source.analytics.includes("never stored"));
    assert(!source.analytics.includes("Website Analytics") && !source.analytics.includes("Math.random"));
    assert(source.analytics.includes("overflow-x-auto") && source.analytics.includes("min-w-0"));
  }
  if (name.startsWith("talent-")) {
    assert(source.talent.includes("data-talent-split-hero") && source.talent.includes("data-talent-hero-media"));
    assert(source.talent.includes("absolute inset-0 h-full w-full object-cover"));
    assert(source.talent.includes("Turn your skills into opportunities worth competing for."));
    assert(/autoPlay muted loop playsInline/.test(source.talent));
    assert(source.talent.includes("sm:min-h-[440px]") && source.talent.includes("lg:grid-cols"));
    assert(source.talent.indexOf("Build a competition record") < source.talent.indexOf("<AmbassadorVideoScroll") && source.talent.indexOf("<AmbassadorVideoScroll") < source.talent.indexOf("How competing works"));
  }
  if (name.startsWith("demo-") || name.startsWith("no-demo-") || name.startsWith("profile-email") || name.startsWith("profile-avatar")) {
    const production = [source.profile, source.identity, source.profileApi, source.bootstrap, source.social, source.publicProfile].join("\n");
    assert(!production.includes('"Demo Member"'));
    assert(source.identity.includes("emailPrefix") && source.identity.includes('|| "Account"'));
    assert(source.identity.includes("initials(displayName)"));
    assert(source.identity.includes("NEXT_PUBLIC_DEMO_MODE"));
    assert(source.profileApi.includes("isDemoProfileContent") && source.social.includes("isQaOrDemoRecord"));
  }
  if (name.startsWith("profile-")) {
    for (const marker of ["data-profile-cover", "data-profile-social-hero", "data-profile-compact-actions", "data-profile-overview"]) assert(source.profile.includes(marker));
    for (const tab of ["overview", "challenges", "entries", "wins", "achievements", "activity"]) assert(source.profile.includes(`"${tab}"`));
    assert(source.profile.includes('activeTab === "achievements"') && source.profile.includes('activeTab === "entries"'));
    assert(!source.profile.includes('activeTab === "overview" || activeTab === "achievements"'));
    assert(!source.profile.includes('activeTab === "overview" || activeTab === "entries"'));
    assert(source.profile.includes("No submissions yet") && source.profile.includes("No achievements yet"));
    assert(source.profile.includes("overflow-x-auto"));
  }
  console.log(`PASS ${name}`);
}
