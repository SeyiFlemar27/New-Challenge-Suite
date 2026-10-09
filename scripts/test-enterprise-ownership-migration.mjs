import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyEnterpriseOwnershipCandidate, enterpriseOwnershipPatch } from "../lib/server/enterprise-ownership-migration.mjs";

const noOwner = classifyEnterpriseOwnershipCandidate({ officialChallenge: true, creatorId: "person-1" });
assert.deepEqual(noOwner, { status: "unresolved", organizationId: null, reason: "no_explicit_organization_owner_mapping" });

const ambiguous = classifyEnterpriseOwnershipCandidate({
  officialChallenge: true,
  organizationOwnerId: "org-a",
  enterpriseOrganizationId: "org-b",
});
assert.equal(ambiguous.status, "unresolved");
assert.equal(ambiguous.reason, "conflicting_explicit_organization_owners");

const inactive = classifyEnterpriseOwnershipCandidate({ organizationOwnerId: "org-a" }, { "org-a": "inactive" });
assert.equal(inactive.status, "unresolved");

const alreadyMapped = classifyEnterpriseOwnershipCandidate({ organizationOwnerId: "org-a", enterpriseFinanceContextId: "org-a" }, { "org-a": "active" });
assert.equal(alreadyMapped.status, "already_mapped");

const eligible = classifyEnterpriseOwnershipCandidate({ enterpriseOrganizationId: "org-a" }, { "org-a": "active" });
assert.equal(eligible.status, "eligible");
assert.deepEqual(enterpriseOwnershipPatch("org-a", "2026-10-07T00:00:00.000Z"), {
  organizationOwnerId: "org-a",
  enterpriseOrganizationId: "org-a",
  enterpriseFinanceContextId: "org-a",
  ownershipMigrationStatus: "mapped",
  ownershipMigratedAt: "2026-10-07T00:00:00.000Z",
});
assert.throws(() => enterpriseOwnershipPatch("", "now"));

const migrationSource = await readFile(new URL("./migrate-enterprise-challenge-ownership.mjs", import.meta.url), "utf8");
assert.match(migrationSource, /orderBy\("__name__"\)\.limit\(limit\)/);
assert.match(migrationSource, /startAfter\(String\(args\.after\)\)/);
assert.match(migrationSource, /migrationAuditLogs/);
assert.match(migrationSource, /if \(audit\.exists\) return/);
assert.match(migrationSource, /enterpriseOwnershipPatch/);
console.log("PASS local Enterprise ownership migration classification, ambiguity, idempotency, and resume contracts");
