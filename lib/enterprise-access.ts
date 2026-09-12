export const ENTERPRISE_ROLES = ["platform_owner", "operations", "reviewer", "finance", "partnerships", "support_safety"] as const;
export type EnterpriseRole = (typeof ENTERPRISE_ROLES)[number];

export const ENTERPRISE_SCOPES = ["assigned_only", "all_official", "read_all_edit_assigned"] as const;
export type EnterpriseScope = (typeof ENTERPRISE_SCOPES)[number];

export const ENTERPRISE_PERMISSIONS = [
  "challenge.create_official", "challenge.view", "challenge.edit", "challenge.assign",
  "participants.view", "participants.manage", "submissions.view", "submissions.review", "reviews.view", "reviews.decide",
  "results.view", "results.propose", "finance.view", "finance.prepare", "sponsors.view", "sponsors.manage",
  "team.view", "team.manage", "notes.view", "notes.write", "activity.view", "analytics.view", "boost.redeem",
] as const;
export type EnterprisePermission = (typeof ENTERPRISE_PERMISSIONS)[number];

export const ENTERPRISE_ROLE_LABELS: Record<EnterpriseRole, string> = {
  platform_owner: "Platform Owner", operations: "Operations", reviewer: "Reviewer", finance: "Finance",
  partnerships: "Partnerships", support_safety: "Support & Safety",
};

export const ENTERPRISE_SCOPE_LABELS: Record<EnterpriseScope, string> = {
  assigned_only: "Assigned Only", all_official: "All Official", read_all_edit_assigned: "Read All / Edit Assigned",
};

const ROLE_PERMISSIONS: Record<EnterpriseRole, EnterprisePermission[]> = {
  platform_owner: [...ENTERPRISE_PERMISSIONS],
  operations: ["challenge.create_official", "challenge.view", "challenge.edit", "challenge.assign", "participants.view", "participants.manage", "submissions.view", "submissions.review", "reviews.view", "results.view", "results.propose", "finance.view", "sponsors.view", "team.view", "team.manage", "notes.view", "notes.write", "activity.view", "analytics.view", "boost.redeem"],
  reviewer: ["challenge.view", "submissions.view", "submissions.review", "reviews.view", "reviews.decide", "results.view", "notes.view", "notes.write", "activity.view"],
  finance: ["challenge.view", "results.view", "finance.view", "finance.prepare", "notes.view", "notes.write", "activity.view", "analytics.view"],
  partnerships: ["challenge.view", "sponsors.view", "sponsors.manage", "notes.view", "notes.write", "activity.view", "analytics.view"],
  support_safety: ["challenge.view", "participants.view", "submissions.view", "reviews.view", "results.view", "notes.view", "notes.write", "activity.view"],
};

export type EnterpriseAccessRecord = {
  status: "active" | "suspended" | "revoked" | "pending_onboarding" | "expired";
  membershipId: string | null;
  enterpriseId: string;
  role: EnterpriseRole;
  scope: EnterpriseScope;
  department: string;
  permissions: EnterprisePermission[];
  categoryScope: string[];
  regionScope: string[];
  onboardingComplete: boolean;
  expiresAt: string | null;
};

export type EnterpriseAccessState = "active" | "pending_onboarding" | "expired" | "suspended" | "revoked" | "unavailable";

export const CHALLENGE_SUITE_ENTERPRISE_ID = "challenge_suite";

// Existing production caps are centralized here. Feature access is intentionally
// separate so an enabled capability never implies an unbounded quantity.
export const ENTERPRISE_LIMITS = {
  activeOfficialChallenges: 1000,
  privateOfficialChallenges: 1000,
  liveEventCapacity: 1000,
  monthlyBoosts: 5,
} as const;

export const ENTERPRISE_FEATURES = {
  normalChallenges: true,
  privateChallenges: true,
  liveEvents: true,
  tournaments: true,
  paidEntry: true,
  paidVotes: true,
  prizes: true,
  sponsorships: true,
  analytics: true,
} as const;

export type WorkspaceContext = "personal" | "sponsor" | "enterprise";

export function isEnterpriseRole(value: unknown): value is EnterpriseRole { return ENTERPRISE_ROLES.includes(value as EnterpriseRole); }
export function isEnterpriseScope(value: unknown): value is EnterpriseScope { return ENTERPRISE_SCOPES.includes(value as EnterpriseScope); }
export function isEnterprisePermission(value: unknown): value is EnterprisePermission { return ENTERPRISE_PERMISSIONS.includes(value as EnterprisePermission); }

export function rolePermissions(role: EnterpriseRole, add: unknown[] = [], remove: unknown[] = []) {
  const permissions = new Set<EnterprisePermission>(ROLE_PERMISSIONS[role]);
  add.filter(isEnterprisePermission).forEach((permission) => permissions.add(permission));
  remove.filter(isEnterprisePermission).forEach((permission) => permissions.delete(permission));
  return [...permissions];
}

function isoDate(value: unknown) {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (value && typeof value === "object") {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === "function") {
      const parsed = candidate.toDate();
      return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    }
    const seconds = Number(candidate.seconds ?? candidate._seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return null;
}

export function normalizeEnterpriseAccess(source: Record<string, unknown>): EnterpriseAccessRecord | null {
  const nested = source.staffAccess && typeof source.staffAccess === "object" ? source.staffAccess as Record<string, unknown> : {};
  const approved = [source.enterpriseAccessStatus, source.enterpriseApprovalStatus].some((value) => String(value ?? "").toLowerCase() === "approved");
  const provisionedLegacyMembership = Boolean(
    source.enterpriseApplicationId
    && (nested.provisionedAt || source.enterpriseApprovedAt)
    && [nested.status, source.enterpriseStaffStatus].some((value) => ["active", "pending_onboarding", "suspended", "revoked", "expired"].includes(String(value ?? "").toLowerCase()))
  );
  const roleValue = nested.role ?? source.enterpriseRole;
  if ((!approved && !provisionedLegacyMembership) || !isEnterpriseRole(roleValue)) return null;
  const scopeValue = nested.scope ?? source.enterpriseScope;
  const statusValue = String(nested.status ?? source.enterpriseStaffStatus ?? "active").toLowerCase();
  const status = (["active", "suspended", "revoked", "pending_onboarding", "expired"].includes(statusValue) ? statusValue : "active") as EnterpriseAccessRecord["status"];
  const explicit = Array.isArray(nested.permissions) ? nested.permissions : Array.isArray(source.enterprisePermissions) ? source.enterprisePermissions : [];
  return {
    status,
    membershipId: typeof (nested.membershipId ?? source.enterpriseMembershipId) === "string" ? String(nested.membershipId ?? source.enterpriseMembershipId) : null,
    enterpriseId: typeof (nested.enterpriseId ?? source.enterpriseId) === "string" ? String(nested.enterpriseId ?? source.enterpriseId) : CHALLENGE_SUITE_ENTERPRISE_ID,
    role: roleValue,
    scope: isEnterpriseScope(scopeValue) ? scopeValue : "assigned_only",
    department: String(nested.department ?? source.enterpriseDepartment ?? "Operations"),
    permissions: explicit.length ? explicit.filter(isEnterprisePermission) : rolePermissions(roleValue),
    categoryScope: (Array.isArray(nested.categoryScope) ? nested.categoryScope : Array.isArray(source.enterpriseCategoryScope) ? source.enterpriseCategoryScope : []).filter((value): value is string => typeof value === "string"),
    regionScope: (Array.isArray(nested.regionScope) ? nested.regionScope : Array.isArray(source.enterpriseRegionScope) ? source.enterpriseRegionScope : []).filter((value): value is string => typeof value === "string"),
    onboardingComplete: Boolean(nested.onboardingComplete ?? source.enterpriseOnboardingComplete),
    expiresAt: isoDate(nested.expiresAt ?? source.enterpriseAccessExpiresAt),
  };
}

export function hasEnterprisePermission(access: EnterpriseAccessRecord | null, permission: EnterprisePermission) {
  if (!isEnterpriseAccessActive(access) || !access) return false;
  return access.permissions.includes(permission);
}

export function isEnterpriseAccessActive(access: EnterpriseAccessRecord | null, now = Date.now()) {
  if (!access || !["active", "pending_onboarding"].includes(access.status)) return false;
  if (!access.expiresAt) return true;
  const expiresAt = Date.parse(access.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function enterpriseAccessState(access: EnterpriseAccessRecord | null, now = Date.now()): EnterpriseAccessState {
  if (!access) return "unavailable";
  if (access.status === "revoked" || access.status === "suspended") return access.status;
  if (access.status === "expired") return "expired";
  if (access.expiresAt) {
    const expiresAt = Date.parse(access.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return "expired";
  }
  return access.status === "pending_onboarding" || !access.onboardingComplete ? "pending_onboarding" : "active";
}

export function resolveActiveWorkspace(source: Record<string, unknown>, access: EnterpriseAccessRecord | null, sponsorAvailable = false): WorkspaceContext {
  if (source.activeWorkspace === "enterprise" && isEnterpriseAccessActive(access)) return "enterprise";
  if (source.activeWorkspace === "sponsor" && sponsorAvailable) return "sponsor";
  return "personal";
}

export function enterpriseChallengeInScope(access: EnterpriseAccessRecord, challenge: Record<string, unknown>, userId: string, write = false) {
  if (challenge.officialChallenge !== true && challenge.ownershipType !== "challenge_suite_official") return false;
  if (String(challenge.organizationOwnerId ?? CHALLENGE_SUITE_ENTERPRISE_ID) !== access.enterpriseId) return false;
  const category = String(challenge.category ?? "");
  const region = String(challenge.region ?? challenge.country ?? "");
  if (access.categoryScope.length && !access.categoryScope.includes(category)) return false;
  if (access.regionScope.length && !access.regionScope.includes(region)) return false;
  const assignments = Array.isArray(challenge.enterpriseAssignments) ? challenge.enterpriseAssignments as Array<Record<string, unknown>> : [];
  const assigned = assignments.some((item) => item.userId === userId && item.status !== "removed");
  if (access.scope === "assigned_only") return assigned;
  if (access.scope === "read_all_edit_assigned") return write ? assigned : true;
  return true;
}
