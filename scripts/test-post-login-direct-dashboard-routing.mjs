import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const routing = await import(pathToFileURL("lib/auth-destination.ts"));
const ready = {
  accountUnavailable: false,
  accountTypeSelectionComplete: true,
  accountIntroOnboardingInProgress: false,
  sponsorAccount: false,
  enterpriseWorkspaceActive: false
};

assert.equal(routing.resolveAuthenticatedDestination(ready), "/dashboard", "Creator and Personal accounts land directly on the main dashboard.");
assert.equal(routing.resolveAuthenticatedDestination({ ...ready, sponsorAccount: true }), "/sponsor/dashboard", "Sponsor accounts land directly on the Sponsor dashboard.");
assert.equal(routing.resolveAuthenticatedDestination({ ...ready, enterpriseWorkspaceActive: true }), "/enterprise", "Authorized active Enterprise workspaces are restored.");
assert.equal(routing.resolveAuthenticatedDestination(ready, "/challenges/protected"), "/challenges/protected", "Protected-route return destinations are preserved.");
assert.equal(routing.resolveAuthenticatedDestination({ ...ready, accountTypeSelectionComplete: false }, "/challenges/protected"), "/onboarding/account-type", "First-time users cannot bypass account-type onboarding with returnTo.");
assert.equal(routing.resolveAuthenticatedDestination({ ...ready, accountIntroOnboardingInProgress: true }, "/challenges/protected"), "/onboarding/welcome", "Incomplete introductions take precedence over returnTo.");
assert.equal(routing.resolveAuthenticatedDestination({ ...ready, accountUnavailable: true }, "/dashboard"), "/account/deletion-status", "Restricted accounts cannot bypass account status checks.");
assert.equal(routing.resolveAuthenticatedDestination(ready), "/dashboard", "Returning users do not repeat completed onboarding.");

const login = fs.readFileSync("app/auth/login/page.tsx", "utf8");
const authService = fs.readFileSync("lib/firebase/auth-service.ts", "utf8");
const verifyEmail = fs.readFileSync("app/auth/verify-email/page.tsx", "utf8");
assert.doesNotMatch(login, /Opening your workspace|Taking you to the right place for your account/);
assert.match(login, /routeAfterLogin\(result\.profile\)/, "The successful sign-in result must navigate with its already verified profile.");
assert.match(login, /interactiveLoginInProgress\.current/, "Interactive login and auth-state restoration must not navigate twice.");
assert.match(login, /searchParams\.get\("next"\) \?\? searchParams\.get\("returnTo"\)/, "Login must preserve safe returnTo aliases from protected routes.");
assert.match(login, /if \(\(authState\.loading \|\| authState\.user\) && !redirectError\) return null;/, "Session resolution must not render an intermediary screen.");
assert.match(authService, /syncServerSession\(credential\.user, rememberMe\)/, "Direct navigation must retain server-side session establishment.");
assert.match(verifyEmail, /params\.get\("returnUrl"\) \|\| params\.get\("next"\) \|\| params\.get\("returnTo"\)/, "Verification must preserve returnTo across required email verification.");
assert.doesNotMatch(verifyEmail, /900|Redirecting\.\.\./, "Email verification must not add an artificial redirect delay.");

console.log("Post-login direct dashboard routing contracts passed.");
