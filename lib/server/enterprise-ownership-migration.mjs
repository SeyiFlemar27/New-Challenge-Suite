const OWNER_FIELDS = ["organizationOwnerId", "enterpriseOrganizationId", "enterpriseFinanceContextId"];

export function classifyEnterpriseOwnershipCandidate(data, organizationStateById = {}) {
  const candidate = data.officialChallenge === true
    || data.ownershipType === "challenge_suite_official"
    || OWNER_FIELDS.some((field) => Boolean(String(data[field] ?? "").trim()));
  if (!candidate) return { status: "not_candidate", organizationId: null, reason: null };

  const explicitOwners = [...new Set(OWNER_FIELDS
    .map((field) => String(data[field] ?? "").trim())
    .filter(Boolean))];
  if (explicitOwners.length > 1) {
    return { status: "unresolved", organizationId: null, reason: "conflicting_explicit_organization_owners" };
  }
  if (explicitOwners.length === 0) {
    return { status: "unresolved", organizationId: null, reason: "no_explicit_organization_owner_mapping" };
  }

  const organizationId = explicitOwners[0];
  const organizationState = organizationStateById[organizationId];
  if (organizationState !== "active") {
    return { status: "unresolved", organizationId, reason: organizationState === "missing" ? "organization_missing_or_inactive" : "organization_state_unverified" };
  }
  if (String(data.organizationOwnerId ?? "").trim() === organizationId) {
    return { status: "already_mapped", organizationId, reason: null };
  }
  return { status: "eligible", organizationId, reason: null };
}

export function enterpriseOwnershipPatch(organizationId, now) {
  if (!String(organizationId ?? "").trim()) throw new Error("An explicit organization id is required.");
  return {
    organizationOwnerId: organizationId,
    enterpriseOrganizationId: organizationId,
    enterpriseFinanceContextId: organizationId,
    ownershipMigrationStatus: "mapped",
    ownershipMigratedAt: now,
  };
}
