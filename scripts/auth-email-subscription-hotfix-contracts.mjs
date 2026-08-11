import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const register = read("app/auth/register/page.tsx");
const authErrors = read("lib/firebase/auth-errors.ts");
const authService = read("lib/firebase/auth-service.ts");
const availability = read("app/api/auth/account-availability/route.ts");
const deletion = read("app/api/account/delete/route.ts");
const adminDeletion = read("app/api/admin/account-deletions/[id]/route.ts");
const bootstrap = read("app/api/auth/profile/bootstrap/route.ts");
const success = read("app/checkout/subscription/success/route.ts");
const host = read("app/dashboard/host/page.tsx");
const gate = read("components/plan-feature-gate.tsx");
const paymentStatus = read("app/api/payments/status/route.ts");

for (const state of ["available", "active_account_exists", "deletion_pending", "deleted_but_auth_not_released", "deleted_email_reuse_allowed", "provider_conflict", "enforcement_review_required", "unknown_conflict"]) {
  assert.ok(availability.includes(state) || authErrors.includes(state), `signup state ${state} must be represented`);
}
for (const copy of [
  "An account already exists with this email. Please sign in or reset your password.",
  "This email is still linked to an account deletion in progress. You can reuse it once deletion is complete.",
  "This email has not been fully released yet. Please try again later or contact support.",
  "This email is already connected to another sign-in method. Please use the original sign-in option.",
  "This email cannot be used to create a new account right now. Please contact support.",
  "We could not create your account right now. Please try again or contact support."
]) assert.ok(authErrors.includes(copy), `friendly auth copy is required: ${copy}`);
assert.ok(availability.includes("getUserByEmail") && availability.includes("providerData"), "availability must inspect Firebase Auth and provider state server-side");
assert.ok(availability.includes("normalizedEmailHash") && availability.includes("deletedAccountReferences"), "deleted-account lookup must use an email hash tombstone");
assert.ok(authService.includes("safeAuthError") && authService.includes("AuthFlowError"), "signup must centralize provider error mapping");
assert.ok(authService.includes("createUserWithEmailAndPassword") && authService.includes("deleted_email_reuse_allowed"), "finalized reusable email must create a fresh Firebase identity");
assert.ok(authService.includes("deleteFirebaseUser(credential.user)"), "failed fresh profile bootstrap must clean up its new Auth identity");
assert.ok(!register.includes("error instanceof Error ? error.message"), "register UI must not render raw provider error messages");
assert.ok(register.includes("AuthIssuePanel") && register.includes('href="/contact"') && register.includes('href="/account/deletion-status"'), "register errors must expose contextual safe actions");
assert.ok(register.includes("Referral code looks invalid. You can leave this blank if you do not have one."), "email-shaped referral codes must receive soft validation");
assert.ok(bootstrap.includes("Referral code looks invalid") && bootstrap.includes("^[A-Za-z0-9_-]{4,32}$"), "server bootstrap must enforce the current referral-code format");

const authDelete = deletion.indexOf("await adminAuth.deleteUser");
const reuseAllowed = deletion.indexOf('emailReuseAllowed: true');
assert.ok(authDelete >= 0 && reuseAllowed > authDelete, "clean deletion must release Firebase Auth before marking email reusable");
assert.ok(deletion.includes("auth_release_pending") && deletion.includes("auth_release_failed") && deletion.includes("account.auth_release_failed"), "Auth release lifecycle and audit states are required");
assert.ok(deletion.includes("adminActionTasks") && deletion.includes("emailReuseAllowed: false"), "Auth release failure must stay blocked and create support work");
assert.ok(adminDeletion.includes("auth_release_failed") && adminDeletion.includes("emailReuseAllowed: false"), "admin finalization failure must not release email reuse");
assert.ok(deletion.includes("retainedFinancialAndAuditRecords: true") && deletion.includes("revokeRefreshTokens"), "history accounts remain pending with retained records");

assert.ok(success.includes("NextResponse.redirect(next, 307)"), "subscription success must issue an immediate HTTP redirect");
assert.ok(success.includes('plan === "host"') && success.includes('"/dashboard/host"'), "Host checkout returns to Host dashboard");
assert.ok(success.includes('plan === "creator"') && success.includes('"/creator"'), "Creator checkout returns to creator dashboard");
assert.ok(success.includes('"/subscriptions"'), "unknown plan returns safely to billing");
for (const stale of ["PaymentStatusJourney", "Checking Payment Status", "Awaiting provider confirmation", "Confirmed: Pending", "Finish Later", "Technical details"]) assert.ok(!success.includes(stale), `subscription success must not render ${stale}`);
for (const unsafe of ["updateDoc(", "setDoc(", "entitlementActive: true", "planStatus: \"active\""]) assert.ok(!success.includes(unsafe), `subscription success must not activate via ${unsafe}`);
assert.ok(gate.includes("allowPendingPreview"), "Host dashboard may render a pending checkout preview");
assert.ok(host.includes("pendingCheckoutReturn") && host.includes("hostAction") && host.includes("Your Host membership is still being activated. Please try again shortly."), "pending Host actions must be contextual and locked");
assert.ok(host.includes("/api/payments/status") && host.includes('verify: "1"'), "Host refresh must refetch server payment state");
assert.ok(host.includes('href="/contact"') && host.includes('href="/subscriptions"'), "Host activation context must link to support and billing");
assert.ok(paymentStatus.includes("requireRequestUser") && paymentStatus.includes("persistStripeSubscriptionLifecycle") && paymentStatus.includes("verifySubscriptionCheckout"), "server/provider entitlement verification must remain intact");

console.log("auth email reuse and subscription redirect contracts passed");
