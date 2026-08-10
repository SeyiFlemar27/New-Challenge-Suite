import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const source = {
  config: read("lib/i18n/config.ts"), complete: read("lib/i18n/complete-dictionary.ts"), provider: read("components/i18n/i18n-provider.tsx"), selector: read("components/i18n/language-selector.tsx"),
  dynamic: read("lib/i18n/dynamic-content.ts"), dynamicUi: read("components/i18n/dynamic-translated-text.tsx"), challenge: read("app/challenges/[id]/page.tsx"),
  home: read("components/public-site/public-home.tsx"), ambassador: read("components/public-site/ambassador-video-scroll.tsx"), topbar: read("components/authenticated-topbar.tsx"),
  metadata: read("lib/i18n/metadata.ts"), homePage: read("app/page.tsx"), talentPage: read("app/for-talent/page.tsx"), contactPage: read("app/contact/page.tsx"),
  login: read("app/auth/login/page.tsx"), register: read("app/auth/register/page.tsx")
};
const publicSource = [source.home, source.ambassador, source.homePage, source.talentPage, source.contactPage].join("\n");
const i18nSource = [source.config, source.complete].join("\n");

export function run(name) {
  for (const code of ["en", "fr", "es", "pt"]) assert.match(source.config, new RegExp(`code: "${code}"`));
  assert.match(source.config, /DEFAULT_LANGUAGE: LanguageCode = "en"/);
  assert.doesNotMatch(source.config, /code: "(?:yo|ig|ha|ar)"/);
  assert.match(source.provider, /pathname\.startsWith\("\/admin"\)/);
  assert.match(source.provider, /applyLanguage\(DEFAULT_LANGUAGE\)/);
  assert.match(source.selector, /localStorage\.setItem/);
  assert.match(source.selector, /document\.cookie/);
  assert.match(source.topbar, /LanguageSelector compact persistAccount/);
  assert.match(source.config, /readableFallback/);
  assert.doesNotMatch(i18nSource, /exchangeRate|convertCurrency/);

  if (name.includes("ambassador")) {
    assert.match(publicSource, /t\("Challenge Suite"\)/);
    assert.match(publicSource, /t\("Every Challenge Starts Here\."\)/);
    assert.match(publicSource, /t\("Battle\. Compete\. Dominate\. Create\."\)/);
    assert.match(publicSource, /From creators to competitors, Challenge Suite is where talent shows up, stands out, and gets rewarded\./);
    assert.doesNotMatch(publicSource, /Community voices|Hear from Challenge Suite Ambassadors|Short video messages from creators, hosts, and ambassadors/);
    assert.doesNotMatch(publicSource, /All For Voting|Win Cash, Clout/);
    assert.match(publicSource, /text-\[clamp\(2rem,8vw,3rem\)\]/);
    assert.match(publicSource, /<span className="block">\{t\("Every Challenge Starts Here\."\)\}<\/span>/);
  }
  if (name.includes("dynamic-content")) {
    assert.match(source.dynamic, /original: string/);
    assert.match(source.dynamic, /translations\?\./);
    assert.match(source.dynamic, /providerStatus: "unavailable"/);
    assert.match(source.dynamic, /secret\|password\|token/);
    assert.match(source.dynamic, /payment\[_-\]\?id/);
    assert.match(source.dynamicUi, /Show original/);
    assert.match(source.dynamicUi, /Show translated/);
    assert.match(source.dynamicUi, /Translation unavailable for this content\./);
    assert.match(source.challenge, /DynamicTranslatedText/);
    assert.doesNotMatch(source.dynamic, /updateDoc|setDoc|addDoc|\.update\(/);
  }
  if (name.includes("seo-meta")) {
    assert.match(source.metadata, /cookies\(\)/);
    assert.match(source.metadata, /translate\(language, title\)/);
    assert.match(source.metadata, /openGraph/);
    assert.match(source.metadata, /twitter/);
    for (const page of [source.homePage, source.talentPage, source.contactPage]) assert.match(page, /fixedPublicMetadata/);
  }
  if (name.includes("auth") || name.includes("login") || name.includes("register")) {
    assert.match(source.login, /useLanguage/);
    assert.match(source.register, /useLanguage/);
    for (const phrase of ["Create Account", "Sign In", "First Name", "Last Name", "Email Address", "Password", "Confirm Password", "Terms of Service", "Privacy Policy", "Community Guidelines"]) assert.ok(i18nSource.includes(phrase), phrase);
  }
  if (name.includes("creator")) for (const phrase of ["Creator Dashboard", "Creator Analytics", "Monthly Boosts", "Participants", "Submissions", "Recorded Votes", "Sponsor Interest"]) assert.ok(i18nSource.includes(phrase), phrase);
  if (name.includes("sponsor")) for (const phrase of ["Sponsor Benefits", "Sponsor Onboarding", "Campaigns", "Proposals", "Brand Profile", "Business Details"]) assert.ok(i18nSource.includes(phrase), phrase);
  if (name.includes("profile") || name.includes("wallet") || name.includes("dorocoin") || name.includes("dashboard")) for (const phrase of ["Profile", "Settings", "Wallet", "Earnings", "DoroCoins", "Challenge Credits", "Overview", "Activity"]) assert.ok(i18nSource.includes(phrase), phrase);
  if (name.includes("app-badges")) for (const phrase of ["Get it on", "App Store", "Google Play", "Coming Soon"]) assert.ok(i18nSource.includes(phrase), phrase);
  console.log(`PASS ${name}`);
}
