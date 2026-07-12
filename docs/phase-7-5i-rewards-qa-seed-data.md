# Phase 7.5I Rewards QA Seed Data

## Purpose

Phase 7.5I adds a controlled QA seed system for the production Rewards Spin Wheel. It does not create live production prize behavior by default. The script is dry-run by default, and no records are written unless `--apply` is explicitly passed.

## Existing Rewards Data Requirements

The Phase 7.5F/7.5H implementation reads these records:

- `rewardSettings/default` for thresholds, enabled tiers, maintenance mode, daily spin limits, public rules, support contact, and the primary campaign ID.
- `rewardCampaigns/{campaignId}` for the active campaign used by `/rewards`, `/rewards/wheel`, and spin eligibility.
- `rewardPrizes/{prizeId}` for configured, enabled prizes. If no configured prizes exist, the user-facing wheel shows setup-required messaging instead of treating fallback prizes as live production prizes.
- `userRewards/{uid}` for available reward points, lifetime points, and tier-specific spin-credit balances.
- `userRewards/{uid}/pointTransactions/{transactionId}` for point history.
- `userRewards/{uid}/spinCredits/{creditId}` for optional seeded test credit records.
- `spinResults`, `rewardClaims`, and `rewardFulfilments` are created by real spin/claim flows, not by the default seed.

## Seed Script Usage

Path:

```bash
scripts/seed-phase-7-5i-rewards-qa.ts
```

Commands:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --cleanup
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --userUid=<uid>
```

The current project uses the existing Node strip-types script style:

```bash
node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts
```

## Dry-Run Behavior

Dry run is the default. It prints the planned documents and collections without loading Firebase Admin credentials and without writing records. No secrets are printed.

## Apply Behavior

`--apply` writes only the planned QA records. It requires Firebase Admin environment variables but does not print their values. Before writing, the script checks each planned document and refuses to overwrite an existing document unless that document is already tagged with this same QA seed batch.

Every written record includes:

- `isQaSeed: true`
- `qaSeedBatchId: phase_7_5i_rewards_qa`
- `createdFor: phase_7_5i_rewards_qa`
- `createdBy: system_qa_seed`
- `createdAt`
- `updatedAt`

## Cleanup Behavior

`--cleanup` deletes only records tagged with `isQaSeed: true` and `qaSeedBatchId: phase_7_5i_rewards_qa`.

For `rewardSettings/default`, cleanup deletes the document only if the default settings document itself is tagged as this QA seed batch. It does not delete untagged or non-QA production settings.

Optional user reward cleanup requires the same `--userUid=<uid>` used during apply so the script can remove the tagged `userRewards/{uid}` subcollection records safely.

## Records Created

Default seed records:

- `rewardSettings/default`
- `rewardCampaigns/phase_7_5i_launch_rewards_qa`
- 9 `rewardPrizes` records: 3 Basic, 3 Standard, and 3 Premium prizes.

Optional `--userUid=<uid>` records:

- `userRewards/{uid}`
- `userRewards/{uid}/pointTransactions/phase_7_5i_test_points`
- `userRewards/{uid}/spinCredits/phase_7_5i_basic_credit`
- `userRewards/{uid}/spinCredits/phase_7_5i_standard_credit`
- `userRewards/{uid}/spinCredits/phase_7_5i_premium_credit`

## Reward Settings

The QA settings enable controlled testing:

- Rewards enabled.
- Basic, Standard, and Premium wheels enabled.
- Basic threshold: `100`
- Standard threshold: `250`
- Premium threshold: `500`
- Daily spin limit: `3`
- Max spins per user: `10`
- Points per DoroCoin: `1`
- Maintenance mode: `false`
- High-value prize KYC required: `true`
- Physical prize address required: `true`
- Cash-out disabled.

## Reward Campaign

Campaign:

- Name: `Launch Rewards QA Campaign`
- ID: `phase_7_5i_launch_rewards_qa`
- Status: active
- Primary: true
- Starts: one day before script run time
- Ends: 30 days after script run time
- Tiers: Basic, Standard, Premium
- Eligible plans: Free, Creator, Host, Enterprise

The campaign terms clearly mark it as controlled QA.

## Prize Records

Basic Wheel:

- `QA Basic - Small DoroCoin Bonus`
- `QA Basic - One Free Vote`
- `QA Basic - Try Again`

Standard Wheel:

- `QA Standard - DoroCoin Bonus`
- `QA Standard - Profile Highlight`
- `QA Standard - Sponsor Coupon`

Premium Wheel:

- `QA Premium - Premium DoroCoin Bonus`
- `QA Premium - Event Ticket`
- `QA Premium - Merch/Product Prize`

Manual/high-value Premium prizes require admin review and KYC before fulfillment. Rewards have no cash-out value.

## Optional Test User UID

If `--userUid=<uid>` is provided with `--apply`, the script seeds a controlled test reward profile:

- `availableRewardPoints: 500`
- `lifetimeRewardPoints: 500`
- `basicSpinCredits: 1`
- `standardSpinCredits: 1`
- `premiumSpinCredits: 1`

The script does not create Firebase Auth users and does not seed credits for random users or all users.

## Admin Setup Guidance

The admin Prize Wheel page already shows the setup prompt when no active prize records exist:

> No active prize records found. Add prizes to activate the wheel.

Admins should replace QA seed prizes with real campaign prizes before launch.

## Risks

- Applying to production would intentionally modify `rewardSettings/default` and activate QA prize records. Use only in a controlled QA environment unless explicitly approved.
- Optional user credits are fake QA credits and must only be seeded for a known test user UID.
- Cleanup cannot safely remove optional user reward subcollections unless the test UID is supplied.

## Verification

Admin verification:

- Visit `/admin/rewards/settings` and confirm thresholds and primary campaign.
- Visit `/admin/rewards/campaigns` and confirm the QA campaign.
- Visit `/admin/rewards/prize-wheel` and confirm the nine QA prizes.

User verification:

- Visit `/rewards` and confirm the active campaign and backend-loaded settings.
- Visit `/rewards/wheel` and confirm configured prizes appear by tier.
- Use a controlled test user with seeded spin credits to verify a server-confirmed spin.

## Firestore Rules

Firestore rules should not be broadly published yet. Run controlled staging QA first to verify admin-only prize/settings writes, user-only reward reads, spin transaction behavior, and claim ownership checks.

## Next QA Phase

Recommended next phase: Phase 7.5J controlled rewards seed apply in staging, admin prize verification, optional test-user spin execution, manual claim flow QA, cleanup verification, and Firestore rule publication readiness review.
