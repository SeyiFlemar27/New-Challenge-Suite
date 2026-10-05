import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const access = read("lib/enterprise-access.ts");
const admin = read("app/api/admin/operations/route.ts");
const create = read("app/api/challenges/route.ts");
const settlement = read("lib/server/challenge-settlement.ts");
const workspace = read("app/api/enterprise/workspace/route.ts");

assert.match(access, /organizationId: string \| null/);
assert.match(admin, /enterpriseOrganizations/);
assert.match(admin, /enterpriseOrganizationId/);
assert.match(create, /enterpriseFinanceContextId: body\.officialChallenge \? enterpriseAccess!\.organizationId : null/);
assert.match(create, /ENTERPRISE_PERSONAL_OWNERSHIP_RETIRED/);
assert.match(settlement, /enterpriseFinanceLedger/);
assert.match(settlement, /enterpriseFinanceWallets/);
assert.match(settlement, /personalWalletFallback: false/);
assert.match(settlement, /!enterpriseOwned && operatorRecipientId/);
assert.match(workspace, /where\("organizationOwnerId", "==", access\.organizationId\)/);

console.log("enterprise ownership and finance are organization-scoped with no personal-wallet fallback: ok");
