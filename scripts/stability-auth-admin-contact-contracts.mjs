import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const publicShell = read("components/public-site/public-shell.tsx");
const login = read("app/auth/login/page.tsx");
const verify = read("app/auth/verify-email/page.tsx");
const otpRequest = read("app/api/auth/email-otp/request/route.ts");
const topbar = read("components/authenticated-topbar.tsx");
const settings = read("app/settings/[section]/page.tsx");
const deletion = read("app/api/account/delete/route.ts");
const accountDeletion = read("lib/server/account-deletion.ts");
const contact = read("components/public-site/contact-experience.tsx");
const publicHome = read("components/public-site/public-home.tsx");
const config = read("lib/public-site/config.ts");
const auth = read("lib/server/auth.ts");
const adminShell = read("components/admin/admin-shell.tsx");
const adminTeam = read("app/api/admin/team/route.ts");
const adminOperations = read("app/api/admin/operations/route.ts");
const adminUi = read("components/admin/admin-control-center.tsx");

assert.match(publicShell, /user\?<><Link href="\/profile"/);
assert.doesNotMatch(publicShell, /if\(user\.isAdmin\)return"\/admin"/);
assert.match(login, /Already signed in/);
assert.match(login, /Switch account \/ Sign out/);
assert.match(login, /safeInternalPath/);
assert.match(verify, /account was created, but we could not send the verification code/);
assert.match(verify, /Resend Code/);
assert.match(verify, /href="\/contact"/);
assert.match(otpRequest, /OTP_RESEND_COOLDOWN/);
assert.match(otpRequest, /await sendEmail/);
assert.match(otpRequest, /await ref\.delete\(\)/);
assert.doesNotMatch(otpRequest, /return ok\([^]*before[^]*sendEmail/);

assert.match(topbar, /User Dashboard/);
assert.match(topbar, /label: "Sponsor"/);
assert.doesNotMatch(topbar, /label: "Host Control Center"/);
assert.doesNotMatch(topbar, /label: "Admin Command Center"/);
assert.doesNotMatch(topbar, /\/auth\/register/);
assert.match(topbar, /sponsorOnboardingComplete/);
assert.match(topbar, /hasSponsorProfile/);

assert.match(settings, /Type DELETE to confirm/);
assert.match(settings, /\/api\/account\/delete/);
assert.match(settings, /recent sign-in is required/i);
assert.match(deletion, /RECENT_AUTH_SECONDS/);
assert.match(deletion, /accountHistorySources/);
assert.match(deletion, /historyFlagsFromSnapshots/);
assert.match(deletion, /profileVisibility: "private"/);
assert.match(deletion, /accountStatus: "deletion_requested"/);
assert.match(deletion, /adminAuth\.deleteUser/);
assert.match(deletion, /publicProfileHidden: true/);
for (const retained of ["cashLedger", "challengeEntryPayments", "paidVotePurchases", "sponsorContributions", "doroCoinPurchases", "withdrawalRequests", "kycRecords", "challengeSettlements", "auditLogs", "stripeCustomerId"]) assert.match(accountDeletion, new RegExp(retained));
assert.doesNotMatch(deletion, /sendEmail|email sent/i);

for (const label of ["Account access or verification", "Challenge, submission, or voting issue", "Payment or subscription", "Withdrawal or payout", "Creator, Host, or Sponsor onboarding", "Abuse, safety, or legal concern"]) assert.match(contact, new RegExp(label));
assert.match(contact, /\/api\/support\/tickets/);
assert.match(contact, /mailto:support@challengesuite\.com/);
assert.match(contact, /public-page/);
assert.match(contact, /sm:p-8/);
assert.doesNotMatch(contact, /starter policy|Confirm this mailbox/i);

assert.match(config, /Every Challenge Starts Here\. Battle\. Compete\. Dominate\. Create\./);
assert.doesNotMatch(config, /Every Challenge Starts Here\. Battle\. Compete\. Dominate\. Create\.[^"\n]+/);
assert.match(publicHome, /PlayStoreMark/);
assert.match(publicHome, /Get it on/);
assert.match(publicHome, /Coming Soon/);
assert.match(publicHome, /min-w-\[176px\]/);
assert.match(publicHome, /PUBLIC_APP_STORE_URL/);
assert.match(publicHome, /PUBLIC_GOOGLE_PLAY_URL/);

assert.match(auth, /requireRecentAdminAuthentication/);
assert.match(auth, /Recent authentication is required/);
assert.doesNotMatch(adminShell, /Second-factor setup required/);
assert.doesNotMatch(auth, /A verified second factor is required/);
assert.match(adminTeam, /No invitation email was sent/);
assert.match(adminTeam, /no email was sent and access was not granted/);
assert.match(adminTeam, /pending_invitation/);
assert.match(adminTeam, /requireRecentAdminAuthentication/);
assert.match(adminOperations, /writeAuditLog/);
assert.match(adminOperations, /previousStatus/);
assert.match(adminUi, /role="dialog"/);
assert.match(adminUi, /fixed inset-0/);
assert.match(adminUi, /reasonRequired/);
assert.match(adminUi, /if \(result\.ok\)/);

const sourceRoots = ["app", "components", "lib"];
for (const sourceRoot of sourceRoots) {
  const stack = [path.join(root, sourceRoot)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        assert.doesNotMatch(fs.readFileSync(full, "utf8"), /\b(?:recognised|recognising|recognises)\b/i, `${full} contains British recognition spelling`);
      }
    }
  }
}

console.log("PASS stability auth, role, admin, contact, deletion, badge, and responsive contracts");
