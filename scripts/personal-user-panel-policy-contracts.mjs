import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const source = read("lib/plan-access.ts");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const policyModule = { exports: {} };
vm.runInNewContext(compiled, { module: policyModule, exports: policyModule.exports, Boolean, Math, Number, String });

const {
  canCreateChallenge,
  getDailyVoteLimit,
  getEffectiveTier,
  getPersonalCapabilities,
  getPlanExperience,
  getVoteWeight
} = policyModule.exports;

const free = getPersonalCapabilities({ planId: "free", planStatus: "active", accountType: "user" });
assert.equal(free.canCreateNormalChallenge, true);
assert.equal(free.normalChallengeQuota.limit, 3);
assert.equal(free.normalChallengeQuota.period, "lifetime");
assert.equal(free.canCreatePrivateChallenge, false);
assert.equal(free.canCreateTournament, false);
assert.equal(free.canCreateLiveEvent, false);
assert.equal(free.monthlyBoostQuota, 0);

const creator = getPersonalCapabilities({ planId: "creator", planStatus: "active", accountType: "user" });
assert.equal(creator.normalChallengeQuota.limit, 3);
assert.equal(creator.normalChallengeQuota.period, "month");
assert.equal(creator.privateChallengeQuota.limit, 1);
assert.equal(creator.tournamentQuota.limit, 1);
assert.equal(creator.canCreateTournament, true);
assert.equal(creator.canCreateLiveEvent, false);
assert.equal(creator.monthlyBoostQuota, 2);
assert.equal(creator.canUseCreatorAnalytics, true);

const host = getPersonalCapabilities({ planId: "host", planStatus: "active", accountType: "user" });
assert.equal(host.normalChallengeQuota.limit, null);
assert.equal(host.privateChallengeQuota.limit, null);
assert.equal(host.tournamentQuota.limit, null);
assert.equal(host.liveEventQuota.limit, null);
assert.equal(host.canCreateLiveEvent, true);
assert.equal(host.canManageHostOperations, true);
assert.equal(host.monthlyBoostQuota, 5);

const downgraded = getPersonalCapabilities({ planId: "creator", planStatus: "cancelled", accountType: "user" });
assert.equal(downgraded.canCreatePrivateChallenge, false);
assert.equal(downgraded.canReceiveNewSponsorProposals, false);
assert.equal(downgraded.canManageExistingPremiumChallenges, true);
assert.equal(downgraded.canManageExistingSponsorObligations, true);
assert.equal(downgraded.canWithdraw, true);

for (const planId of ["free", "creator", "pro", "host", "enterprise"]) {
  const profile = { planId, planStatus: "active", accountType: "user" };
  assert.equal(getDailyVoteLimit(profile), 1, `${planId} must receive one free vote per day`);
  assert.equal(getVoteWeight(profile, true), 1, `${planId} must not receive plan-weighted outcomes`);
}

assert.equal(canCreateChallenge({ planId: "creator", planStatus: "active" }, { publish: true, type: "tournament" }, 0).allowed, true);
assert.equal(canCreateChallenge({ planId: "creator", planStatus: "active" }, { publish: true, type: "public" }, 3).allowed, true, "Monthly quota enforcement must not be confused with concurrent active challenge count.");
assert.equal(canCreateChallenge({ planId: "creator", planStatus: "active" }, { publish: true, competitionFormat: "live event" }, 0).allowed, false);
assert.equal(canCreateChallenge({ planId: "host", planStatus: "active" }, { publish: true, competitionFormat: "live event" }, 0).allowed, true);

const legacyTier = getEffectiveTier({ planId: "pro", planStatus: "active", accountType: "user" });
assert.equal(legacyTier.id, "creator");
assert.equal(legacyTier.displayName, "Creator Plan");
assert.equal(getPlanExperience({ planId: "pro", planStatus: "active" }).planId, "creator");

const sidebar = read("components/sidebar.tsx");
assert.match(sidebar, /getPersonalCapabilities/);
assert.match(sidebar, /capabilities\.canCreateTournament/);
assert.match(sidebar, /capabilities\.canCreateLiveEvent/);
assert.match(sidebar, /Host Control Center/);
assert.ok(!sidebar.includes("creatorSections"), "Navigation must not select a static creator menu by route alone.");
assert.ok(!sidebar.includes("hostSections"), "Navigation must not select a static host menu by route alone.");
assert.match(sidebar, /const sections = signedOut/);
assert.match(sidebar, /sections\.map/);

const subscriptions = read("lib/server/subscriptions.ts");
assert.match(subscriptions, /filter\(\(plan\) => plan\.id !== "pro"\)/);
assert.match(subscriptions, /2 Challenge Boosts\/month/);
assert.match(subscriptions, /5 Challenge Boosts\/month/);

const validation = read("lib/server/challenge-validation.ts");
assert.match(validation, /weightedVotes: z\.coerce\.boolean\(\)\.transform\(\(\) => false\)/);
assert.match(validation, /votesPerUserPerDay: z\.coerce\.number\(\)\.int\(\)\.transform\(\(\) => 1\)/);

const visibleSources = [
  "components/brand.tsx",
  "components/sidebar.tsx",
  "app/dashboard/page.tsx",
  "app/settings/customization/page.tsx",
  "lib/challenge-builder-foundation.ts",
  "lib/server/social-profile.ts"
].map(read).join("\n");
for (const retiredPattern of [/\bCreator Pro\b/, /\bPro Badge\b/, /Requires Pro plan/, /vote multipliers up to/]) {
  assert.ok(!retiredPattern.test(visibleSources), `Public UI must not expose ${retiredPattern}.`);
}

console.log("Personal user panel policy contracts passed.");
