import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";

export const SPONSOR_MEMBERSHIP_ROLES = ["owner", "admin", "campaign_manager", "finance", "analyst", "viewer"] as const;
export type SponsorMembershipRole = typeof SPONSOR_MEMBERSHIP_ROLES[number];

export const SPONSOR_PERMISSIONS = [
  "organization.view",
  "organization.manage",
  "profile.manage",
  "discover.view",
  "proposal.view",
  "proposal.manage",
  "sponsorship.view",
  "sponsorship.manage",
  "deliverable.view",
  "deliverable.manage",
  "analytics.view",
  "report.view",
  "wallet.view",
  "wallet.fund",
  "team.manage"
] as const;
export type SponsorPermission = typeof SPONSOR_PERMISSIONS[number];

export type SponsorOrganizationAccess = {
  organizationId: string;
  organization: Record<string, unknown>;
  membershipId: string;
  role: SponsorMembershipRole;
  permissions: SponsorPermission[];
  status: "active";
  legacyCompatible: boolean;
};

const rolePermissions: Record<SponsorMembershipRole, SponsorPermission[]> = {
  owner: [...SPONSOR_PERMISSIONS],
  admin: SPONSOR_PERMISSIONS.filter((permission) => permission !== "wallet.fund"),
  campaign_manager: ["organization.view", "profile.manage", "discover.view", "proposal.view", "proposal.manage", "sponsorship.view", "sponsorship.manage", "deliverable.view", "deliverable.manage", "analytics.view", "report.view"],
  finance: ["organization.view", "proposal.view", "sponsorship.view", "analytics.view", "report.view", "wallet.view", "wallet.fund"],
  analyst: ["organization.view", "discover.view", "proposal.view", "sponsorship.view", "deliverable.view", "analytics.view", "report.view", "wallet.view"],
  viewer: ["organization.view", "discover.view", "proposal.view", "sponsorship.view", "deliverable.view", "analytics.view", "report.view"]
};

function role(value: unknown): SponsorMembershipRole {
  return SPONSOR_MEMBERSHIP_ROLES.includes(value as SponsorMembershipRole) ? value as SponsorMembershipRole : "viewer";
}

function permissionsFor(membership: Record<string, unknown>, membershipRole: SponsorMembershipRole) {
  const explicit = Array.isArray(membership.permissions)
    ? membership.permissions.filter((value): value is SponsorPermission => SPONSOR_PERMISSIONS.includes(value as SponsorPermission))
    : [];
  return explicit.length ? explicit : rolePermissions[membershipRole];
}

function organizationAllowed(organization: Record<string, unknown>) {
  return !["suspended", "closed", "deleted", "restricted"].includes(String(organization.status ?? "active").toLowerCase());
}

export async function resolveSponsorOrganizationAccess(db: Firestore, userId: string): Promise<SponsorOrganizationAccess | null> {
  const memberships = await db.collection("sponsorMemberships").where("userId", "==", userId).limit(10).get();
  let hasCanonicalMembership = false;
  for (const doc of memberships.docs) {
    const membership = doc.data() ?? {};
    hasCanonicalMembership = true;
    if (String(membership.status ?? "active") !== "active") continue;
    const organizationId = String(membership.sponsorOrganizationId ?? membership.organizationId ?? "");
    if (!organizationId) continue;
    const organizationSnap = await db.collection("sponsorOrganizations").doc(organizationId).get();
    if (!organizationSnap.exists || !organizationAllowed(organizationSnap.data() ?? {})) continue;
    const membershipRole = role(membership.role);
    return { organizationId, organization: { id: organizationId, ...(organizationSnap.data() ?? {}) }, membershipId: doc.id, role: membershipRole, permissions: permissionsFor(membership, membershipRole), status: "active", legacyCompatible: false };
  }

  // A canonical pending or restricted membership must not be upgraded by the
  // compatibility fallback used for records created before organizations.
  if (hasCanonicalMembership) return null;

  const [userSnap, profileSnap, sponsorProfileSnap] = await Promise.all([
    db.collection("users").doc(userId).get(),
    db.collection("profiles").doc(userId).get(),
    db.collection("sponsorProfiles").doc(userId).get()
  ]);
  const legacy = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}), ...(sponsorProfileSnap.data() ?? {}) };
  const legacySponsor = sponsorProfileSnap.exists || legacy.accountType === "sponsor" || legacy.dashboardType === "sponsor_dashboard" || legacy.sponsorAccessStatus === "active";
  if (!legacySponsor || ["suspended", "flagged"].includes(String(legacy.sponsorVerificationStatus ?? ""))) return null;
  const organizationId = String(legacy.sponsorOrganizationId ?? userId);
  const membershipRole: SponsorMembershipRole = "owner";
  return {
    organizationId,
    organization: { id: organizationId, name: legacy.brandName ?? legacy.displayName ?? "Sponsor Workspace", logoUrl: legacy.logoUrl ?? null, verificationStatus: legacy.sponsorVerificationStatus ?? "not_submitted", status: "active", legacyOwnerUserId: userId },
    membershipId: deterministicId("sponsor_membership", organizationId, userId),
    role: membershipRole,
    permissions: rolePermissions[membershipRole],
    status: "active",
    legacyCompatible: true
  };
}

export async function ensurePrimarySponsorOrganization(db: Firestore, input: { userId: string; name: string; profile: Record<string, unknown> }) {
  const existing = await resolveSponsorOrganizationAccess(db, input.userId);
  const organizationId = existing?.organizationId ?? input.userId;
  const membershipId = deterministicId("sponsor_membership", organizationId, input.userId);
  const now = new Date().toISOString();
  const onboardingComplete = input.profile.sponsorOnboardingComplete === true;
  const membershipStatus = onboardingComplete ? "active" : "pending_onboarding";
  const batch = db.batch();
  batch.set(db.collection("sponsorOrganizations").doc(organizationId), {
    id: organizationId,
    name: input.name,
    logoUrl: input.profile.logoUrl ?? null,
    industry: input.profile.industry ?? "",
    country: input.profile.countryLocation ?? input.profile.businessRegistrationCountry ?? "",
    about: input.profile.brandDescription ?? "",
    website: input.profile.website ?? null,
    verificationStatus: input.profile.sponsorVerificationStatus ?? "not_submitted",
    sponsorPlan: input.profile.planId ?? null,
    status: membershipStatus,
    createdBy: existing ? existing.organization.createdBy ?? input.userId : input.userId,
    createdAt: existing ? existing.organization.createdAt ?? now : now,
    updatedAt: now
  }, { merge: true });
  batch.set(db.collection("sponsorMemberships").doc(membershipId), {
    id: membershipId,
    sponsorOrganizationId: organizationId,
    userId: input.userId,
    role: existing?.role ?? "owner",
    permissions: existing?.permissions ?? rolePermissions.owner,
    status: "active",
    createdAt: now,
    updatedAt: now
  }, { merge: true });
  const capability = { sponsorOrganizationId: organizationId, sponsorMembershipId: membershipId, sponsorAccessStatus: membershipStatus, updatedAt: now };
  batch.set(db.collection("users").doc(input.userId), capability, { merge: true });
  batch.set(db.collection("profiles").doc(input.userId), capability, { merge: true });
  await batch.commit();
  return { organizationId, membershipId };
}

export function hasSponsorPermission(access: SponsorOrganizationAccess, permission: SponsorPermission) {
  return access.permissions.includes(permission);
}

export async function listSponsorOrganizationMemberUserIds(db: Firestore, organizationId: string) {
  const memberships = await db.collection("sponsorMemberships")
    .where("sponsorOrganizationId", "==", organizationId)
    .limit(100)
    .get();
  const userIds = memberships.docs
    .filter((doc) => String(doc.data().status ?? "active") === "active")
    .map((doc) => String(doc.data().userId ?? "").trim())
    .filter(Boolean);
  if (userIds.length) return [...new Set(userIds)];

  const organization = await db.collection("sponsorOrganizations").doc(organizationId).get();
  const legacyOwnerUserId = String(organization.data()?.legacyOwnerUserId ?? "").trim();
  return legacyOwnerUserId ? [legacyOwnerUserId] : [];
}
