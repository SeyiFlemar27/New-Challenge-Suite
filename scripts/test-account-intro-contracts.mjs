import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const accountRouting = read("lib/account-routing.ts");
const selectionRoute = read("app/api/auth/profile/bootstrap/route.ts");
const introRoute = read("app/api/onboarding/intro/route.ts");
const welcomePage = read("app/onboarding/welcome/page.tsx");
const verifyPage = read("app/auth/verify-email/page.tsx");
const registerPage = read("app/auth/register/page.tsx");

assert.match(accountRouting, /accountTypeSelectionComplete === false\) return "\/onboarding\/account-type"/);
assert.match(accountRouting, /accountIntroOnboardingStatus === "in_progress"\) return "\/onboarding\/welcome"/);
assert.match(accountRouting, /setupPending \|\| !requestedPath \? defaultRoute : requestedPath/);
assert.match(selectionRoute, /accountType: z\.enum\(\["creator", "sponsor"\]\)/);
assert.match(selectionRoute, /db\.runTransaction\(async \(transaction\)/);
assert.match(selectionRoute, /accountIntroOnboardingStatus: "in_progress"/);
assert.match(selectionRoute, /accountIntroOnboardingStep: 0/);
assert.match(introRoute, /requireAuthenticatedUser\(request\)/);
assert.match(introRoute, /db\.runTransaction\(async \(transaction\)/);
assert.match(introRoute, /nextStep > currentStep \+ 1/);
assert.match(introRoute, /currentStep < 2/);
assert.match(introRoute, /accountIntroOnboardingStatus: "complete"/);
assert.match(welcomePage, /Your creativity starts here\./);
assert.match(welcomePage, /Put your brand where it matters\./);
assert.match(welcomePage, /Screen \{flow\.step \+ 1\} of 3/);
assert.match(welcomePage, /Back/);
assert.match(welcomePage, /Continue/);
assert.doesNotMatch(registerPage, /Continue with Google|GoogleAuthProvider|loginWithGoogle/);
assert.match(registerPage, /choose Creator or Sponsor/);
assert.match(verifyPage, /getAuthenticatedDestination\(profile\.data\.user/);
assert.doesNotMatch(verifyPage, /if \(!profile\.ok \|\| !profile\.data\?\.user\) return explicitReturnUrl/);

console.log("PASS account introduction authorization, persistence, ordering, and copy contracts");
