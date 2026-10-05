import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const enterprise = read("lib/enterprise-access.ts");
const planAccess = read("lib/plan-access.ts");
const managementAccess = read("lib/server/challenge-management-access.ts");
const challengeCreate = read("app/api/challenges/route.ts");
const challengePublish = read("app/api/challenges/[id]/publish/route.ts");
const privateBuilder = read("components/challenge-builder.tsx");
const validation = read("lib/server/challenge-validation.ts");
const liveBuilder = read("components/host/host-competition-wizard.tsx");
const voting = read("lib/server/voting.ts");
const verifyCheckout = read("app/api/verify-checkout/route.ts");
const sponsorClick = read("app/sponsor/click/[sponsorshipId]/route.ts");
const storageRules = read("storage.rules");

assert.match(enterprise, /activeChallengeLimit: 10/);
assert.match(planAccess, /enterprise:[\s\S]*?activeChallengeLimit: 10/);
assert.match(managementAccess, /isOfficialEnterpriseChallenge/);
assert.match(managementAccess, /enterpriseChallengeInScope/);
assert.match(challengeCreate, /ENTERPRISE_ACTIVE_CHALLENGE_LIMIT_REACHED/);
assert.match(challengePublish, /ENTERPRISE_ACTIVE_CHALLENGE_LIMIT_REACHED/);
assert.match(privateBuilder, /invite_link/);
assert.match(privateBuilder, /invitation_code/);
assert.match(privateBuilder, /direct_invitations/);
assert.match(privateBuilder, /participantRequirements/);
assert.match(validation, /PRIVATE_ACCESS_METHOD_REQUIRED/);
assert.doesNotMatch(liveBuilder, /form\.externalLiveUrl/);
assert.match(voting, /DOROCOIN_COST_PER_VOTE = 5/);
assert.match(voting, /doroCoinWallets/);
assert.match(voting, /LARGE_DOROCOIN_SPEND_CONFIRMATION_REQUIRED/);
assert.match(verifyCheckout, /expand: \["line_items"\]/);
assert.doesNotMatch(sponsorClick, /x-forwarded-for/);
assert.match(sponsorClick, /consumeRateLimit/);
assert.match(storageRules, /5 \* 1024 \* 1024/);
assert.match(storageRules, /50 \* 1024 \* 1024/);

console.log("Final audit remediation contracts passed.");
