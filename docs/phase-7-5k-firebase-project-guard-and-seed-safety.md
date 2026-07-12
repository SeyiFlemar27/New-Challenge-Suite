# Phase 7.5K Firebase Project Guard and Seed Safety

## Summary

Phase 7.5K adds a strict Firebase project guard to the Phase 7.5I rewards QA seed script. The seed system remains dry-run by default. This phase did not run `--apply`, did not run project-confirmed cleanup, did not write records, and did not publish Firestore or Storage rules.

## Firebase Config Inspection

Safe files inspected:

- `firebase.json`
- `package.json`
- `scripts/seed-phase-7-5i-rewards-qa.ts`
- existing rewards QA docs

Files intentionally not inspected:

- `.env.local`
- `.env`
- private key files
- provider secret files

Findings:

- `.firebaserc` does not exist.
- `firebase.json` exists.
- `firebase.json` includes Firestore rules/indexes and Storage rules paths.
- No Firebase project alias is configured in safe local config.
- `package.json` includes the existing `seed:firestore` Node strip-types script style.
- The rewards QA seed script cannot safely infer a Firebase target from local config.

Because `.firebaserc` is absent, any seed apply without explicit project confirmation risks accidental production writes. This is a P0 operational blocker for uncontrolled seed apply.

## Project Guard Behavior

Dry-run can run without a project target:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts
```

Writes require one explicit project source:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --project=<stagingProjectId>
```

or:

```bash
REWARDS_QA_FIREBASE_PROJECT=<stagingProjectId> node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply
```

If `--apply` or `--cleanup` is run without a confirmed project, the script fails before Firebase Admin credentials are loaded:

```text
Refusing to write: Firebase project target is not explicitly confirmed. Pass --project=<projectId> or set REWARDS_QA_FIREBASE_PROJECT.
```

## Production Confirmation Guard

If the confirmed project appears to be production, the script requires an additional explicit flag:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --project=<productionProjectId> --confirm-production-qa
```

Without the confirmation flag, writes fail with:

```text
Refusing production QA write without --confirm-production-qa.
```

This guard is intended as a final safety latch. Staging remains the recommended target for QA seed apply.

## Record Tagging

Future writes include the existing QA tags:

- `isQaSeed: true`
- `qaSeedBatchId: phase_7_5i_rewards_qa`
- `createdFor: phase_7_5i_rewards_qa`
- `createdBy: system_qa_seed`

Future writes also include:

- `qaSeedEnvironment`
- `qaSeedProjectId`

Dry-run reports the confirmed project and derived QA seed environment when provided.

## Command Examples

Dry-run:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts
```

Apply to staging:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --project=<stagingProjectId>
```

Apply to staging with test user:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --project=<stagingProjectId> --userUid=<testUserUid>
```

Cleanup staging:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --cleanup --project=<stagingProjectId>
```

Production QA apply, only if explicitly approved:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --project=<productionProjectId> --confirm-production-qa
```

## Test User UID Guidance

A test user UID should come from a known staging Firebase Auth user created for QA. Do not invent a UID. Do not seed all users. Do not create Auth users from this seed script.

Optional test-user credits require:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --project=<stagingProjectId> --userUid=<testUserUid>
```

## Verification After Controlled Apply

Admin verification:

- `/admin/rewards/settings` shows QA thresholds and the primary campaign.
- `/admin/rewards/campaigns` shows `Launch Rewards QA Campaign`.
- `/admin/rewards/prize-wheel` shows the nine QA-tagged prizes.

User verification:

- `/rewards` shows backend-loaded settings and campaign state.
- `/rewards/wheel` shows configured prizes by tier.
- `/rewards/history` remains clean until a server-confirmed spin is completed.

## Cleanup Plan

Cleanup must target the same controlled Firebase project and should be run only after QA is complete:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --cleanup --project=<stagingProjectId>
```

Cleanup deletes only records with:

- `isQaSeed: true`
- `qaSeedBatchId: phase_7_5i_rewards_qa`

It does not delete untagged production data or unrelated user records.

## Validation Results

Validation should include:

- Dry-run succeeds and writes no records.
- `--apply` without project fails safely.
- `--cleanup` without project fails safely.
- Typecheck passes.
- Build passes.

## Remaining P0 Blockers

- No `.firebaserc` or staging Firebase alias is configured in safe local config.
- A controlled staging Firebase project ID must be confirmed before any seed apply.
- Seed apply is still blocked for production unless explicitly approved and guarded with `--confirm-production-qa`.

## Remaining P1 Issues

- Add a proper staging Firebase alias when the project structure is ready.
- Run controlled staging apply only after test users and admin credentials are confirmed.
- Verify cleanup in staging after seed apply QA.
- Firestore rules should not be broadly published until controlled seed/spin QA passes.
## Phase 7.5K Validation Result

Commands run in `C:\Dev\New-Challenge-Suite`:

- `node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts` passed as dry-run, planned 11 records, and reported `writesPerformed:false`.
- `node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply` failed safely with the explicit Firebase project guard message and wrote no records.
- `node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --cleanup` failed safely with the explicit Firebase project guard message and deleted no records.
- `pnpm.cmd typecheck` passed.
- `pnpm.cmd build` passed with 116 static pages generated.
- Generated `tsconfig.tsbuildinfo` was reverted after build.

No `--apply` command with a project was run. No `--cleanup` command with a project was run. No Firestore or Storage rules were published.
