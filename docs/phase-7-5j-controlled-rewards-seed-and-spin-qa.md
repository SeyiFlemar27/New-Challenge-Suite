# Phase 7.5J Controlled Rewards Seed and Spin QA

## Deployment Verification

Vercel deployment was checked through the Vercel connector for project `challenge-suite`.

- Expected commit: `adba0fa`
- Confirmed production deployment: `READY`
- Deployment ID: `dpl_77iFfELcmW3J7cwu2BkopXWEaDoq`
- Target: `production`
- Full deployed SHA: `adba0fa0ea42d570bd229d0631ca1358246adaf6`
- Commit message: `Add rewards QA seed data script`

## Firebase Target / Environment

Local Firebase configuration status:

- `.firebaserc`: not present
- `firebase.json`: present, defines Firestore rules/indexes and Storage rules only
- `.env.local`: present, but not read or printed
- Firebase project target: not safely confirmable without reading runtime env values
- Seed script target behavior: uses Firebase Admin environment variables at runtime

Result: controlled seed apply is blocked. The currently confirmed app deployment is production and there is no local `.firebaserc` staging alias. Per the safety rules, `--apply` was not run.

Required stop condition:

> Controlled seed apply requires approval because the current Firebase target appears to be production or is not safely distinguishable from production.

## Dry-Run Result

Command run:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts
```

Result:

- Passed
- `mode: dry-run`
- `apply: false`
- `cleanup: false`
- `userUid: not_provided`
- `writesPerformed: false`
- Planned records: 11

Planned collections:

- `rewardSettings`: 1 record
- `rewardCampaigns`: 1 record
- `rewardPrizes`: 9 records

Planned records:

- `rewardSettings/default`
- `rewardCampaigns/phase_7_5i_launch_rewards_qa`
- `rewardPrizes/phase_7_5i_basic_dorocoin_bonus`
- `rewardPrizes/phase_7_5i_basic_free_vote`
- `rewardPrizes/phase_7_5i_basic_try_again`
- `rewardPrizes/phase_7_5i_standard_dorocoin_bonus`
- `rewardPrizes/phase_7_5i_standard_profile_highlight`
- `rewardPrizes/phase_7_5i_standard_sponsor_coupon`
- `rewardPrizes/phase_7_5i_premium_dorocoin_bonus`
- `rewardPrizes/phase_7_5i_premium_event_ticket`
- `rewardPrizes/phase_7_5i_premium_merch_product`

Node emitted a module-type warning because the script is TypeScript run through Node strip-types in a package without `type: module`. The script still completed successfully.

## Apply Status

`--apply` was not run.

Reason:

- No separate staging Firebase target was confirmed.
- The active Vercel deployment target is production.
- `.env.local` was not read, and no safe runtime Firebase project label was available.
- User did not explicitly approve production seed apply.

No records were created or updated.

## Optional Test User Apply Status

`--apply --userUid=<TEST_USER_UID>` was not run.

Reason:

- No known test user UID was provided.
- No controlled/staging Firebase target was confirmed.
- The script is designed to seed optional user rewards only when a UID is explicitly provided.

No user reward profile, spin credits, or point transactions were created.

## Cleanup Status

`--cleanup` was not run.

Reason:

- No QA records were applied in this phase.
- Cleanup requires approval and a known target.

Records cleaned up: none.

## Records Created

None.

## Admin Prize / Settings / Campaign QA

Hands-on admin verification was not executed because seed apply was blocked. Expected checks after approved controlled apply:

- `/admin/rewards/settings` shows QA thresholds and primary campaign.
- `/admin/rewards/campaigns` shows `Launch Rewards QA Campaign`.
- `/admin/rewards/prize-wheel` shows nine QA-tagged prizes.
- Admin sees setup guidance if no prize records exist.
- QA prizes are visibly non-final and must be replaced before launch.

Source/API review:

- Admin prize APIs require `requireAdminUser`.
- Admin settings APIs require `requireAdminUser`.
- Admin create/update operations write audit logs where implemented.

## User Rewards Navigation QA

Hands-on credentialed user QA was not executed because no seeded test user and no controlled apply target were available.

Expected checks after approved controlled apply/test user setup:

- `/dashboard` exposes Rewards & Spin Wheel CTA.
- `/wallet` links to Rewards/Spin Wheel.
- `/rewards` shows backend-loaded points, campaign, and tier progress.
- `/rewards/wheel` shows Basic, Standard, and Premium wheels.
- `/rewards/history` loads cleanly.
- No hard-coded fake production balances are shown.

## Spin Wheel Visibility QA

Not executed hands-on. The seed dry-run confirms the prize data needed for visibility is planned. Once applied in staging/control environment, `/api/rewards/prizes` should return configured prizes instead of setup-required fallback behavior.

## Spin Eligibility QA

Not executed hands-on. Required controlled test data:

- A known test user UID.
- `userRewards/{uid}` with one Basic, Standard, and Premium spin credit from the seed script.
- Active QA reward settings, campaign, and prize records.

Expected behavior to verify:

- Basic credit spins only Basic.
- Standard credit spins only Standard.
- Premium credit spins only Premium.
- No-credit states disable spin buttons.
- Campaign disabled/ended and no-prize states block spin.
- Duplicate click/idempotency does not create duplicate rewards.

## Server-Side Spin Transaction QA

Not executed because seed apply and test user setup were blocked.

Source review confirms:

- `/api/rewards/spin` requires authenticated user.
- Request accepts selected tier and idempotency key only.
- `executeRewardSpin` validates tier credits server-side.
- Server selects prize through reward helper logic.
- Spin result, reward/claim/fulfilment records, inventory changes, usage counters, and audit logs are handled in server transaction flow.
- Frontend cannot submit desired prize.

## Reward History / Claim QA

Not executed hands-on.

Source review confirms:

- `/api/rewards/history` requires authenticated user and reads only records for `user.uid`.
- `/api/rewards/claims/[claimId]` checks ownership before returning claim data.
- `/api/rewards/claim` requires authenticated user and `createRewardClaim` enforces ownership, terms acceptance, and duplicate-claim blocking.

## Admin Fulfilment QA

Not executed hands-on.

Expected checks after a manual prize is won in controlled QA:

- `/admin/rewards/spins` shows spin result.
- `/admin/rewards/fulfilment` shows manual fulfilment record.
- Admin can review/update fulfilment foundation state.
- Non-admin users are blocked.
- Admin actions are audited where implemented.

## Firestore / API Security Review

Firestore reward collections are fail-closed in `firestore.rules`:

- `rewardSettings`: `allow read, write: if false`
- `rewardCampaigns`: `allow read, write: if false`
- `rewardPrizes`: `allow read, write: if false`
- `userRewards`: `allow read, write: if false`
- `spinResults`: `allow read, write: if false`
- `rewardClaims`: `allow read, write: if false`
- `rewardFulfilments`: `allow read, write: if false`
- `rewardAuditLogs`: fail-closed in the same rules area

API review:

- Admin prize/settings/campaign writes require admin APIs.
- User spin and claim actions require authenticated APIs.
- Users cannot directly grant themselves points, spin credits, prize records, inventory updates, or fulfilment completion through Firestore client rules.
- The seed script uses Firebase Admin credentials only when `--apply` or `--cleanup` is invoked.

Do not broadly publish Firestore rules yet. Controlled staging QA is still required.

## Remaining P0 Blockers

- No separate staging Firebase project or `.firebaserc` alias confirmed.
- Current Firebase target cannot be safely distinguished from production without approved env inspection or external dashboard confirmation.
- No explicit approval to apply QA seed records to production.
- No known test user UID was provided.
- No credentialed admin/user browser QA was possible without seed apply and credentials.

## Remaining P1 Issues

- Add an explicit `--project` / `--expectedProjectId` execution guard to the seed script before broad use.
- Add an admin-only QA seed indicator if Phase 7.5I records are active.
- Add a controlled staging runbook with screenshots for rewards, spin, history, fulfilment, and cleanup.
- Verify manual prize claim and fulfilment with real staging accounts.
- Verify duplicate spin/idempotency behavior with controlled requests.

## Recommended Next Phase

Phase 7.5K should establish a controlled Firebase staging target or obtain explicit production QA approval, provide one test user UID and one admin credential, run the seed apply, execute one controlled spin per tier if safe, test manual claim/fulfilment, and then run cleanup verification.
