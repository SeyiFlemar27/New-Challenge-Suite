import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const tempDir = join(root, ".tmp-free-user-flow");
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

const challengeAccessSource = readFileSync(join(root, "lib/server/challenge-access.ts"), "utf8")
  .replace('import type { Firestore } from "firebase-admin/firestore";', "type Firestore = any;");
await writeFile(join(tempDir, "challenge-access.ts"), challengeAccessSource, "utf8");

const publicChallengeSource = readFileSync(join(root, "lib/server/public-challenge.ts"), "utf8");
const challengeStatusSource = readFileSync(join(root, "lib/challenge-status.ts"), "utf8");
const publicStatusMatch = challengeStatusSource.match(/export const PUBLIC_CHALLENGE_STATUS_VALUES = (\[[\s\S]*?\]) as const;/);
assert(publicStatusMatch, "canonical public challenge status values must be exported");
const standalonePublicChallengeSource = publicChallengeSource.replace(
  'import { isPublicChallengeStatus } from "@/lib/challenge-status";',
  `const PUBLIC_CHALLENGE_STATUS_VALUES = ${publicStatusMatch[1]};\nconst PUBLIC_STATUS_SET = new Set(PUBLIC_CHALLENGE_STATUS_VALUES);\nfunction isPublicChallengeStatus(value) { return PUBLIC_STATUS_SET.has(String(value ?? "").toLowerCase()); }`
);
await writeFile(join(tempDir, "public-challenge.ts"), standalonePublicChallengeSource, "utf8");

const planAccessSource = readFileSync(join(root, "lib/plan-access.ts"), "utf8")
  .replace('import type { AccountType, ProductPlanId as BlueprintPlanId, SponsorProductPlanId, UserProductPlanId } from "@/lib/types";', [
    'type AccountType = "user" | "creator" | "host" | "sponsor" | "admin";',
    'type BlueprintPlanId = "free" | "creator" | "pro" | "host" | "enterprise" | "sponsor_starter" | "brand_partner" | "enterprise_partner";',
    'type SponsorProductPlanId = "sponsor_starter" | "brand_partner" | "enterprise_partner";',
    'type UserProductPlanId = "free" | "creator" | "pro" | "host" | "enterprise";'
  ].join("\n"));
await writeFile(join(tempDir, "plan-access.ts"), planAccessSource, "utf8");

const {
  challengeForPlanAccess,
  hasChallengeAccessGrant,
  isPrivateChallengeRecord,
  userOwnsChallenge
} = await import(pathToFileURL(join(tempDir, "challenge-access.ts")).href);
const { isPublicChallenge } = await import(pathToFileURL(join(tempDir, "public-challenge.ts")).href);
const { canAccessChallenge, canCreateChallenge, getPersonalCapabilities, getUserPlanAccess } = await import(pathToFileURL(join(tempDir, "plan-access.ts")).href);

function mockDb(approvedKeys = new Set()) {
  return {
    collection(name) {
      assert.equal(name, "privateChallengeAccess");
      return {
        doc(id) {
          return {
            async get() {
              return {
                exists: approvedKeys.has(id),
                data: () => approvedKeys.has(id) ? { status: "approved" } : null
              };
            }
          };
        }
      };
    }
  };
}

const freeProfile = { accountType: "user", subscriptionPlan: "free", subscriptionStatus: "active" };
const freeAccess = getUserPlanAccess(freeProfile);
assert.equal(freeAccess.normalizedPlanId, "free");
assert.equal(freeAccess.activeChallengeLimit, 3);
assert.equal(freeAccess.canCreatePaidChallenges, false);
assert.equal(freeAccess.canCreatePrivateChallenges, false);
assert.deepEqual(getPersonalCapabilities(freeProfile).normalChallengeQuota, { limit: 3, period: "lifetime" });

assert.equal(isPublicChallenge("public-challenge", { status: "published", visibility: "public" }), true);
assert.equal(isPublicChallenge("draft-challenge", { status: "draft", visibility: "public" }), false);
assert.equal(isPublicChallenge("private-challenge", { status: "published", visibility: "private" }), false);
assert.equal(isPublicChallenge("demo-challenge", { status: "published", visibility: "public", isDemo: true }), false);

assert.equal(isPrivateChallengeRecord({ visibility: "private" }), true);
assert.equal(isPrivateChallengeRecord({ type: "invite_only" }), true);
assert.equal(isPrivateChallengeRecord({ visibility: "public", type: "basic" }), false);
assert.equal(userOwnsChallenge({ creatorId: "user_1" }, "user_1"), true);
assert.equal(userOwnsChallenge({ hostId: "host_1" }, "user_1"), false);

assert.equal(await hasChallengeAccessGrant(mockDb(new Set(["challenge_1_user_1"])), "challenge_1", "user_1"), true);
assert.equal(await hasChallengeAccessGrant(mockDb(), "challenge_1", "user_1"), false);

let accessContext = await challengeForPlanAccess(mockDb(), { id: "challenge_1", visibility: "public" }, "user_1");
assert.equal(accessContext.privateOnly, false);
assert.equal(canAccessChallenge(freeProfile, accessContext.challenge).allowed, true);

accessContext = await challengeForPlanAccess(mockDb(), { id: "challenge_1", visibility: "private", creatorId: "owner_1" }, "user_1");
assert.equal(accessContext.privateOnly, true);
assert.equal(accessContext.hasAccessGrant, false);
assert.equal(canAccessChallenge(freeProfile, accessContext.challenge).allowed, false);

accessContext = await challengeForPlanAccess(mockDb(new Set(["challenge_1_user_1"])), { id: "challenge_1", visibility: "private", creatorId: "owner_1" }, "user_1");
assert.equal(accessContext.privateOnly, true);
assert.equal(accessContext.hasAccessGrant, true);
assert.equal(canAccessChallenge(freeProfile, accessContext.challenge).allowed, true);

accessContext = await challengeForPlanAccess(mockDb(), { id: "challenge_1", visibility: "private", creatorId: "user_1" }, "user_1");
assert.equal(accessContext.privateOnly, true);
assert.equal(accessContext.hasAccessGrant, true);
assert.equal(canAccessChallenge(freeProfile, accessContext.challenge).allowed, true);

let creation = canCreateChallenge(freeProfile, { publish: true, status: "published", type: "public", prizeType: "bragging_rights" }, 2);
assert.equal(creation.allowed, true);
creation = canCreateChallenge(freeProfile, { publish: true, status: "published", type: "public", prizeType: "bragging_rights" }, 3);
assert.equal(creation.allowed, true, "historical quota enforcement belongs to the server route with authoritative challenge history");
const createRouteSource = readFileSync(join(root, "app/api/challenges/route.ts"), "utf8");
const publishRouteSource = readFileSync(join(root, "app/api/challenges/[id]/publish/route.ts"), "utf8");
for (const source of [createRouteSource, publishRouteSource]) {
  assert(source.includes("FREE_BASIC_CHALLENGE_LIFETIME_LIMIT"), "Free lifetime quota must remain server-enforced");
  assert(source.includes("freeBasicUsage"), "Free lifetime quota must use authoritative owned-challenge history");
}
creation = canCreateChallenge(freeProfile, { publish: true, status: "published", type: "private", prizeType: "bragging_rights" }, 0);
assert.equal(creation.allowed, false);
creation = canCreateChallenge(freeProfile, { publish: true, status: "published", type: "public", entryFee: 5 }, 0);
assert.equal(creation.allowed, false);
assert.equal(creation.code, "CREATOR_REQUIRED");

await rm(tempDir, { recursive: true, force: true });
console.log("Free-user backend flow constraints validated.");
