import assert from "node:assert/strict";
import { revenueShareFoundation } from "../lib/server/revenue-sharing.ts";

const input = { challengeId: "challenge", creatorId: "actor", sponsorEnabled: true, now: "2026-10-12T00:00:00.000Z" };
const personal = revenueShareFoundation({ ...input, challenge: { creatorId: "owner" } });
assert.equal(personal.creatorId, "owner");
assert.equal(personal.financialOwnerId, "owner");
assert.equal(personal.initiatedByUserId, "actor");
assert.equal(personal.workspaceType, "personal");
const enterprise = revenueShareFoundation({ ...input, challenge: { creatorId: "lead", officialChallenge: true, organizationOwnerId: "organization" } });
assert.equal(enterprise.creatorId, null, "Enterprise revenue must not have a personal financial owner");
assert.equal(enterprise.financialOwnerId, "organization");
assert.equal(enterprise.financialOwnerType, "organization");
assert.equal(enterprise.initiatedByUserId, "actor");
assert.throws(() => revenueShareFoundation({ ...input, challenge: { officialChallenge: true } }), /ENTERPRISE_ORGANIZATION_REQUIRED/);
assert.throws(() => revenueShareFoundation({ ...input, challenge: { organizationOwnerId: "a", enterpriseOrganizationId: "b" } }), /ENTERPRISE_FINANCE_OWNER_MISMATCH/);
console.log("PASS revenue foundations separate the initiating actor from Personal and Enterprise financial ownership and reject ambiguous ownership");
