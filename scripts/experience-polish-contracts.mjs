import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sources = {
  talent: read("components/public-site/for-talent-experience.tsx"),
  ambassador: read("components/public-site/ambassador-video-scroll.tsx"),
  home: read("components/public-site/public-home.tsx"),
  register: read("app/auth/register/page.tsx"),
  creator: read("components/creator/creator-workspace.tsx"),
  profile: read("app/profile/page.tsx"),
  sponsorStart: read("app/sponsor/start/page.tsx"),
  sponsorBenefits: read("app/sponsor/benefits/page.tsx"),
  sponsorOnboarding: read("app/sponsor/onboarding/page.tsx"),
  sponsorShell: read("components/sponsor/sponsor-shell.tsx"),
  i18n: read("lib/i18n/config.ts"),
  selector: read("components/i18n/language-selector.tsx"),
  languageApi: read("app/api/profile/language/route.ts"),
  cleanup: read("scripts/demo-record-cleanup.mjs")
};

function common(name) {
  assert(!Object.values(sources).join("\n").includes("Demo Member"), `${name}: demo member copy must not render`);
  assert(!sources.creator.includes("Math.random"), `${name}: creator metrics must not be fabricated`);
}

export function run(name) {
  common(name);
  if (name.includes("talent-hero")) { assert(sources.talent.includes("7482047-uhd_3840_2160_25fps_tt0bu6.mp4")); assert(/autoPlay muted loop playsInline/.test(sources.talent)); }
  if (name.includes("talent-ambassador")) { assert(sources.talent.includes("<AmbassadorVideoScroll")); assert(sources.talent.indexOf("Build a competition record") < sources.talent.indexOf("<AmbassadorVideoScroll")); assert(sources.talent.indexOf("<AmbassadorVideoScroll") < sources.talent.indexOf("How competing works")); assert(sources.ambassador.includes("lg:basis-[calc((100%-2rem)/3)]")); }
  if (name.includes("faq")) { assert(sources.talent.match(/\[\"/g)?.length >= 10); assert(sources.home.includes("<PublicFaq")); }
  if (name.includes("register")) { assert(sources.register.includes("justify-between")); assert(sources.register.includes("items-start gap-3")); assert(sources.register.includes("First Name") && sources.register.includes("Community Guidelines")); }
  if (name.includes("creator-dashboard")) { assert(sources.creator.includes("Owned challenges")); assert(sources.creator.includes("Next steps")); assert(sources.creator.includes("/api/host/operations")); }
  if (name.includes("creator-analytics")) { assert(sources.creator.includes("CreatorAnalytics")); assert(sources.creator.includes("/api/host/operations")); }
  if (name.includes("monthly-boosts")) { assert(sources.creator.includes("eligibleBoosts")); assert(sources.creator.includes("/boost`")); assert(sources.creator.includes("Review Boost")); }
  if (name.includes("sponsor-ready")) { assert(sources.creator.includes("sponsorReady")); assert(sources.creator.includes("Manage Readiness")); }
  if (name.includes("profile")) { assert(sources.profile.includes("Profile sections")); for (const tab of ["overview","challenges","entries","wins","achievements","activity"]) assert(sources.profile.includes(`\"${tab}\"`)); }
  if (name.includes("sponsor-benefits")) { assert(sources.sponsorBenefits.includes("How sponsorship works")); assert(!sources.sponsorBenefits.includes("guaranteed ROI")); }
  if (name.includes("sponsor-start")) assert(sources.sponsorStart.includes('href="/sponsor/benefits"'));
  if (name.includes("sponsor-onboarding")) { assert(sources.sponsorOnboarding.includes("Save & Finish Later")); assert(sources.sponsorOnboarding.includes("Return to Overview")); }
  if (name.includes("sponsor-preapproval")) assert(sources.sponsorShell.includes("Complete brand profile") && sources.sponsorShell.includes("Plan &amp; Billing"));
  if (name.includes("i18n")) { for (const code of ["en","fr","es","pt"]) assert(sources.i18n.includes(`code: \"${code}\"`)); assert(sources.i18n.includes('DEFAULT_LANGUAGE: LanguageCode = "en"')); assert(sources.selector.includes("localStorage.setItem")); assert(sources.languageApi.includes("requireRequestUser")); }
  if (name.includes("demo-record-cleanup")) { assert(sources.cleanup.includes("Dry run only")); assert(sources.cleanup.includes("PROTECTED_COLLECTIONS")); assert(sources.cleanup.includes("Deletion is intentionally unavailable")); }
  console.log(`PASS ${name}`);
}
