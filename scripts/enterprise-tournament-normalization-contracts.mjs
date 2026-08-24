import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const selected = new Set(process.argv.slice(2));
const run = (name, check) => { if (!selected.size || selected.has(name)) check(); };

run("enterprise_identity", () => {
  const admin = read("app/api/admin/operations/route.ts");
  const access = read("lib/enterprise-access.ts");
  const bootstrap = read("app/api/auth/profile/bootstrap/route.ts");
  assert.match(admin, /personalAccountTypePreserved: previousAccountType/);
  assert.match(admin, /workspaceTypes: \["personal", "enterprise"\]/);
  assert.doesNotMatch(admin, /enterprisePreviousAccountType/);
  assert.match(access, /isEnterpriseAccessActive/);
  assert.match(access, /expiresAt > now/);
  assert.match(bootstrap, /availableWorkspaces/);
  assert.match(bootstrap, /activeWorkspace/);
  assert.match(bootstrap, /legacyEnterpriseIdentity/);
  assert.match(bootstrap, /enterprisePreviousAccountType/);
});

run("workspace_switch", () => {
  const route = read("app/api/auth/workspace/route.ts");
  const switcher = read("components/workspace-switcher.tsx");
  const sidebar = read("components/sidebar.tsx");
  assert.match(route, /requireAuthenticatedUser/);
  assert.match(route, /workspace === "enterprise" && !current\.enterpriseAvailable/);
  assert.match(route, /grantsAuthorization: false/);
  assert.match(route, /workspace\.switched/);
  assert.match(switcher, /Personal Workspace/);
  assert.match(switcher, /Challenge Suite Enterprise/);
  assert.match(switcher, /data-builder-surface/);
  assert.match(switcher, /may have unsaved changes/);
  assert.match(sidebar, /WorkspaceSwitcher/);
});

run("ownership_lock", () => {
  const draft = read("app/api/challenges/drafts/[id]/route.ts");
  const settlement = read("lib/server/challenge-settlement.ts");
  assert.match(draft, /CHALLENGE_OWNERSHIP_LOCKED/);
  assert.match(draft, /body\.ownershipType/);
  assert.match(draft, /body\.officialChallenge/);
  assert.match(settlement, /enterprise_official_organizational_share/);
  assert.match(settlement, /requires_enterprise_finance_review/);
});

run("tournament_bridge", () => {
  const bridge = read("lib/server/tournament-settlement.ts");
  const admin = read("app/api/admin/tournaments/[id]/route.ts");
  const creator = read("app/api/tournaments/[id]/manage/actions/route.ts");
  assert.match(bridge, /createInternalChallengeSettlement/);
  assert.match(bridge, /entityCollection: "tournaments"/);
  assert.match(bridge, /webhookConfirmed === true/);
  assert.match(bridge, /confirmedEntryRevenueCents/);
  assert.match(bridge, /confirmedPaidVoteRevenueCents/);
  assert.match(bridge, /confirmedSponsorPrizeCents/);
  assert.match(bridge, /confirmedCreatorPrizeCents/);
  assert.match(creator, /review_final_placements/);
  assert.match(creator, /tournamentPlacementFingerprint/);
  assert.match(admin, /finalizeTournamentSettlement/);
  assert.match(admin, /payoutProviderCalled: false/);
});

run("team_settlement", () => {
  const bridge = read("lib/server/tournament-settlement.ts");
  const settlement = read("lib/server/challenge-settlement.ts");
  assert.match(bridge, /rosterLockedAt/);
  assert.match(bridge, /lockedRosterSnapshots/);
  assert.match(bridge, /disqualifiedMemberUserIds/);
  assert.match(bridge, /pending_hold/);
  assert.match(settlement, /Math\.floor\(total \/ members\.length\)/);
  assert.match(settlement, /total % members\.length/);
  assert.match(settlement, /allocationOrder/);
  assert.match(settlement, /lockedBalanceCents/);
});

run("settlement_provenance", () => {
  const bridge = read("lib/server/tournament-settlement.ts");
  const settlement = read("lib/server/challenge-settlement.ts");
  assert.match(bridge, /deterministicId\("tournament_winner_proposal"/);
  assert.match(bridge, /settlementPlacementFingerprint/);
  assert.match(bridge, /proposalMetadata:/);
  assert.match(bridge, /sourceProvenance/);
  assert.match(settlement, /challengeSettlements/);
  assert.match(settlement, /cashLedger/);
  assert.match(settlement, /platformLedger/);
  assert.match(settlement, /input\.proposalMetadata/);
  assert.match(settlement, /externalPayoutExecuted: false/);
  assert.match(settlement, /grossConfirmedCreatorPrizeAmount/);
});

run("controlled_inputs", () => {
  const controls = read("components/challenge-controlled-fields.tsx");
  const tournament = read("components/tournament-builder.tsx");
  const live = read("components/host/host-competition-wizard.tsx");
  const validation = read("lib/server/tournament-validation.ts");
  assert.match(controls, /NORMAL_CHALLENGE_CATEGORIES/);
  assert.match(controls, /Legacy value:/);
  assert.match(controls, /\/api\/accounts\/search/);
  assert.match(tournament, /ChallengeTaxonomyFields/);
  assert.match(tournament, /currency: "USD"/);
  assert.doesNotMatch(tournament, /<option value="NGN">/);
  assert.match(tournament, /type="number" min="0" max="120" step="1"/);
  assert.match(live, /RegisteredAccountPicker/);
  assert.match(live, /NORMAL_ELIGIBLE_COUNTRIES/);
  assert.match(validation, /isCanonicalChallengeSubcategory/);
  assert.match(validation, /Tournament money values are recorded in USD/);
});

run("judge_authority", () => {
  const search = read("app/api/accounts/search/route.ts");
  const publish = read("app/api/challenges/[id]/publish/route.ts");
  const schema = read("lib/server/challenge-validation.ts");
  assert.match(search, /requireAuthenticatedUser/);
  assert.match(search, /db\.collection\("users"\)/);
  assert.doesNotMatch(search, /email:/);
  assert.match(publish, /REGISTERED_JUDGE_REQUIRED/);
  assert.match(publish, /REGISTERED_JUDGE_INVALID/);
  assert.match(publish, /accountStatus/);
  assert.match(schema, /judgeAccountIds/);
  assert.match(schema, /qrCheckInRequiresServerToken/);
});

console.log(`Enterprise, Tournament settlement, and controlled-input contracts passed${selected.size ? `: ${[...selected].join(", ")}` : ""}.`);
