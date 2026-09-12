import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const access = read("lib/enterprise-access.ts");
const serverAccess = read("lib/server/enterprise-access.ts");
const applications = read("app/api/enterprise-inquiries/route.ts");
const admin = read("app/api/admin/operations/route.ts");
const create = read("app/api/challenges/route.ts");
const publish = read("app/api/challenges/[id]/publish/route.ts");
const lifecycle = read("lib/server/enterprise-access-lifecycle.ts");
const scheduler = read("app/api/internal/sponsor-completion/route.ts");
const workspace = read("app/api/enterprise/workspace/route.ts");
const createEntry = read("components/enterprise/enterprise-create-entry.tsx");
const sidebar = read("components/sidebar.tsx");
const onboarding = read("app/enterprise/onboarding/page.tsx");
const notification = read("lib/server/notifications.ts");

assert(!access.includes('"challenge.create_personal"'), "Enterprise roles must not create Personal challenges from Enterprise context.");
assert(access.includes("CHALLENGE_SUITE_ENTERPRISE_ID") && access.includes("ENTERPRISE_LIMITS"), "Enterprise ownership and explicit production limits must be centralized.");
assert(access.includes('status: "active" | "suspended" | "revoked" | "pending_onboarding" | "expired"'), "Membership states must be explicit.");
assert(access.includes('typeof candidate.toDate === "function"') && access.includes("enterpriseAccessState"), "Firestore expiry timestamps must not be mistaken for perpetual access.");
assert(access.includes("provisionedLegacyMembership") && access.includes("enterpriseApplicationId"), "Provisioned legacy memberships need guarded read compatibility.");
assert(serverAccess.includes("ENTERPRISE_ACCESS_REQUIRED") && serverAccess.includes("ENTERPRISE_ACCESS_EXPIRED") && serverAccess.includes("ENTERPRISE_ACCESS_REVOKED") && serverAccess.includes("ENTERPRISE_ACCESS_SUSPENDED"), "Enterprise denial states must not collapse into Invalid access.");
assert(serverAccess.includes("obligation_only") && serverAccess.includes("obligationChallengeIds"), "Expired memberships must retain only scoped obligation access.");
assert(serverAccess.includes("options.allowObligationAccess") && serverAccess.includes("obligationPermissions"), "Obligation access must be explicit and permission limited.");
assert(applications.includes("STALE_APPLICATION_VERSION") && applications.includes("REAPPLY_NOT_ALLOWED") && applications.includes("enterpriseApplicationRevisionId"), "Applications need version conflicts, reapply controls and canonical revisions.");
assert(applications.includes("unchanged: true") && applications.includes("enterpriseApplicationId(auth.user.uid)"), "Duplicate application submissions must remain idempotent.");
assert(admin.includes("idempotentApproval") && admin.includes("enterpriseMembershipId") && admin.includes("enterpriseExpiresAt"), "Approval must provision one retry-safe membership with nullable expiry.");
assert(admin.includes("suspend_access") && admin.includes("revoke_access") && admin.includes("restore_access"), "Admin must have separately authorized access lifecycle controls.");
assert(create.includes("ENTERPRISE_PERSONAL_OWNERSHIP_NOT_ALLOWED") && create.includes("entitlementProfile") && create.includes("ENTERPRISE_ACTIVE_CHALLENGE_LIMIT_REACHED"), "Official creation must be organization owned, Enterprise entitled and explicitly capped.");
assert(publish.includes("officialChallenge") && publish.includes("entitlementProfile") && publish.includes("ENTERPRISE_OFFICIAL_CREATE_DENIED"), "Submit for review must revalidate current Enterprise access independently of Personal plan.");
assert(createEntry.includes("Switch to Personal Workspace") && !createEntry.includes("Personal Challenge</h2>"), "Enterprise creation UI must explain, not blur, ownership context.");
assert(!sidebar.includes('allowed("challenge.create_personal")'), "Enterprise navigation must not expose Personal creation permission.");
assert(lifecycle.includes("48 * HOUR") && lifecycle.includes("24 * HOUR") && lifecycle.includes("enterprise_access_expired"), "Expiry warnings and final expiry must be scheduled.");
assert(!lifecycle.includes("else if (remaining <= 48"), "Access granted inside the 24-hour window must still receive the immediate first warning and the final warning.");
assert(scheduler.includes("processEnterpriseAccessLifecycle"), "Enterprise lifecycle processing must use the existing authenticated scheduler.");
assert(notification.includes("if (idempotencyKey)") && notification.includes("existing.id"), "Deterministic notifications must preserve an existing read state.");
assert(workspace.includes("sectionPermission") && workspace.includes("organizationOwnerId") && workspace.includes("settlementUnresolvedAllocations"), "Enterprise sections must be permission and organization scoped with isolated finance.");
assert(onboarding.includes("error && !state"), "Denied onboarding must resolve to a useful state instead of loading forever.");

for (const type of ["normal", "private", "live", "tournament"]) {
  const legacy = read(`app/enterprise/challenges/create/personal/${type}/page.tsx`);
  assert(legacy.includes("redirect("), `Legacy ${type} Personal-in-Enterprise route must redirect safely.`);
}

console.log("Enterprise access production contracts passed.");
