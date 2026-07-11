# Phase 7.4I: Staging Fixture Creation and Credentialed QA Execution

## Executive summary

Phase 7.4I creates a practical staging QA fixture system and execution checklist for the flows that previous phases could only review at code level.

Result: **safe fixture tooling created, but no real data was written and no credentialed browser QA was executed.**

A dry-run-by-default script was added:

```powershell
node --experimental-strip-types scripts/seed-phase-7-4i-qa.ts --dry-run
```

The script prepares a deterministic QA batch:

- `qaSeedBatchId: phase_7_4i_qa`
- `isQaSeed: true`
- `createdFor: "phase_7_4i_qa"`
- `createdBy: "admin_qa"`

The script does not create Firebase Auth users or passwords. It creates Firestore fixture records only when explicitly run with `--apply`. Cleanup is also explicit and deletes only matching QA-tagged records.

No payouts, withdrawals, refunds, sponsor releases, prize releases, fake KYC approvals, raw ID/face storage, DoroCoin-to-cash conversion, real-money betting, fake ad vote rewards, automatic Prediction Arena settlement, or automatic high-value reward fulfillment were activated.

## Staging environment status

Repository checks:

- `.firebaserc`: not present
- `firebase.json`: present with local `firestore.rules` and `storage.rules`
- separate staging Firebase project: **not configured in the repo**
- separate staging Vercel deployment: not explicitly configured as a separate environment; production Git deployment exists
- separate staging Stripe setup: not confirmed
- admin QA data tools: present at `/admin/qa-data` and `/api/admin/qa-data`
- safe seed script support: added in this phase
- Firebase emulator support: not configured in the repo

P0 operational blocker:

A separate staging Firebase project is not confirmed. Do not publish Firestore or Storage rules broadly to production until either:

1. a staging Firebase project exists, or
2. a tightly controlled production QA window is approved with rollback, test accounts, and deletion plan.

## Fixture script

New script:

```text
scripts/seed-phase-7-4i-qa.ts
```

Dry-run command:

```powershell
node --experimental-strip-types scripts/seed-phase-7-4i-qa.ts --dry-run
```

Apply command:

```powershell
node --experimental-strip-types scripts/seed-phase-7-4i-qa.ts --apply
```

Cleanup command:

```powershell
node --experimental-strip-types scripts/seed-phase-7-4i-qa.ts --apply --cleanup
```

Dry-run result:

| Collection | Count |
| --- | ---: |
| `qaSeedBatches` | 1 |
| `users` | 21 |
| `profiles` | 121 |
| `challenges` | 18 |
| `challengeParticipants` | 103 |
| `privateChallengeInvites` | 4 |
| `privateChallengeAccess` | 1 |
| `sponsorProfiles` | 8 |
| `doroCoinWallets` | 2 |
| `predictionRecords` | 2 |
| `rewardWheelPrizes` | 3 |
| `rewardSpinHistory` | 1 |
| `voterRewardEvents` | 1 |
| `submissions` | 1 |
| `revenueShareLedgers` | 1 |
| `adVoteRewardLogs` | 1 |

Total planned records: `289`.

The dry run does not require Firebase Admin credentials and does not write data.

## Test accounts

The script creates Firestore `users` and `profiles` documents for QA identities, but it intentionally does not create Firebase Auth users or passwords.

Manual Firebase Auth users still required:

| QA identity | Firestore ID | Auth action required |
| --- | --- | --- |
| Free user with 0 challenges | `qa-free-0-challenges` | Create matching Auth user or map UID manually |
| Free user with 1 challenge | `qa-free-1-challenges` | Create matching Auth user or map UID manually |
| Free user with 2 challenges | `qa-free-2-challenges` | Create matching Auth user or map UID manually |
| Free user with 3 challenges | `qa-free-3-challenges` | Create matching Auth user or map UID manually |
| Paid Creator | `qa-paid-creator` | Create matching Auth user or map UID manually |
| Paid Creator pending KYC | `qa-paid-creator-kyc-pending` | Create matching Auth user or map UID manually |
| Paid Creator KYC verified | `qa-paid-creator-kyc-verified` | Create matching Auth user or map UID manually |
| Paid Host | `qa-paid-host` | Create matching Auth user or map UID manually |
| Paid Host pending KYC | `qa-paid-host-kyc-pending` | Create matching Auth user or map UID manually |
| Sponsor not submitted | `qa-sponsor-not-submitted` | Create matching Auth user or map UID manually |
| Sponsor pending review | `qa-sponsor-pending-review` | Create matching Auth user or map UID manually |
| Sponsor approved unpaid | `qa-sponsor-approved-unpaid` | Create matching Auth user or map UID manually |
| Sponsor approved paid | `qa-sponsor-approved-paid` | Create matching Auth user or map UID manually |
| Admin | `qa-admin-reviewer` | Create matching Auth user and admin claim/allowlist |
| User with DoroCoins | `qa-dorocoin-rich` | Create matching Auth user or map UID manually |
| User with no DoroCoins | `qa-dorocoin-empty` | Create matching Auth user or map UID manually |
| User with reward points | `qa-reward-points` | Create matching Auth user or map UID manually |
| User with spin credits | `qa-spin-credits` | Create matching Auth user or map UID manually |
| User with no spin credits | `qa-no-spin-credits` | Create matching Auth user or map UID manually |
| User with valid private access | `qa-private-access` | Create matching Auth user or map UID manually |
| User without private access | `qa-private-no-access` | Create matching Auth user or map UID manually |

No real passwords should be stored in the repository, docs, or script output.

## Challenge fixtures

The fixture script plans these challenge records:

| Challenge | Purpose |
| --- | --- |
| `qa-public-basic-empty` | public basic challenge with no participants |
| `qa-public-100-participants` | public participant directory test with 100 participants |
| `qa-public-approved-submissions` | approved submission visibility test |
| `qa-private-valid` | private challenge with valid invite |
| `qa-private-expired` | private challenge with expired invite |
| `qa-private-disabled` | private challenge with disabled invite |
| `qa-private-max-use` | private challenge with max-use reached invite |
| `qa-prediction-eligible` | Prediction Arena eligible challenge |
| `qa-prediction-started` | Prediction Arena closed because challenge started |
| `qa-prediction-ended` | Prediction Arena closed because challenge ended |
| `qa-live-physical-event` | physical event with external livestream metadata |
| `qa-tournament-rounds` | tournament with multi-stage round foundation |
| `qa-free-1-challenge-1` | Free user 1/3 lifetime state |
| `qa-free-2-challenge-1..2` | Free user 2/3 lifetime state |
| `qa-free-3-challenge-1..3` | Free user 3/3 lifetime state |

Free basic challenge records include the fields used by server-side counting:

- `creatorId`
- `creatorPlanId: "free"`
- `freeBasicChallenge: true`
- counted lifecycle/status values

## Participant fixtures

The script plans:

- 100 public-safe participants for `qa-public-100-participants`
- 1 private participant for `qa-private-valid`
- 2 Prediction Arena eligible participants for `qa-prediction-eligible`

Participant records intentionally avoid private/sensitive fields:

- no email
- no phone
- no KYC status
- no wallet data
- no internal notes
- no moderation flags
- no private submission data

The script also creates public `profiles` documents for the 100 participant identities so profile links can be tested.

## Private invite fixtures

The script plans:

| Invite | Code | Expected behavior |
| --- | --- | --- |
| `qa-invite-valid` | `QA-VALID-74I` | grants access |
| `qa-invite-expired` | `QA-EXPIRED-74I` | fails expired check |
| `qa-invite-disabled` | `QA-DISABLED-74I` | fails disabled check |
| `qa-invite-max-use` | `QA-MAX-74I` | fails max-use check |
| nonexistent code | documented only | invalid code fails cleanly |

The script also creates a `privateChallengeAccess` record for `qa-private-access` on `qa-private-valid`.

## Sponsor fixtures

The script plans sponsor profiles for:

- `not_submitted`
- `draft`
- `pending_review`
- `needs_changes`
- `approved` + `unpaid`
- `approved` + `active`
- `rejected`
- `suspended`

Sponsor records include safe placeholder media URLs and normalized website fields for dashboard state testing. Upload behavior still requires browser testing with Storage rules published in a controlled environment.

## DoroCoin and Prediction Arena fixtures

The script plans:

- `doroCoinWallets/qa-dorocoin-rich` with positive balance
- `doroCoinWallets/qa-dorocoin-empty` with zero balance
- existing Prediction Arena record for `qa-prediction-eligible`
- closed Prediction Arena record for `qa-prediction-started`

Prediction records remain DoroCoin-only:

- `cashPayoutEnabled: false`
- `moneyMovementEnabled: false`
- `settlementRequiresAdminReview: true`

No automatic settlement is created.

## Rewards and spin fixtures

The script plans:

- user with reward points
- user with Basic/Standard/Premium spin credits
- Basic wheel prize
- Standard wheel prize
- Premium manual/high-value prize
- pending manual fulfillment spin history
- voter reward event from server-confirmed DoroCoin purchase foundation

No user can self-grant points or spin credits through these fixtures. The records exist to test display and admin review workflows.

## Ads-for-votes fixture

The script plans:

- `adVoteRewardLogs/qa-ad-provider-off`

Expected behavior:

- provider not configured
- fake client completion blocked
- `voteGranted: false`
- provider verification required

No fake ad vote reward is granted.

## Revenue sharing fixture

The script plans:

- `revenueShareLedgers/qa-revenue-share-ledger`

Fixture values:

- generated revenue: 1,000,000 cents
- winners share: 650,000 cents
- host share: 150,000 cents
- sponsor share: 100,000 cents
- platform share: 100,000 cents
- initial prize pool: 100,000 cents, 100% winner-directed
- challenger vote-revenue bonus: 2,000 cents
- status: `pending_admin_review`

No release or payout execution is created.

## QA execution checklist

| Route | Account/fixture | Expected behavior | Screenshot |
| --- | --- | --- | --- |
| `/dashboard` | each account state | correct dashboard, badge, no wrong free/premium flicker | yes |
| `/challenges/create` | free 0/1/2/3 users | 0/1/2 can create, 3 sees gate, premium tools locked | yes |
| `/my-challenges` | free users and creator/host | owned QA challenges visible | yes |
| `/challenges` | public visitor | QA private records hidden from public discovery | yes |
| `/challenges/qa-public-100-participants` | public/user | participant directory search/load-more works | yes |
| `/private` | private access/no-access users | proper access state | yes |
| `/private/QA-VALID-74I` | private access user | valid invite grants access | yes |
| `/private/QA-EXPIRED-74I` | any user | expired invite denied | yes |
| `/private/QA-DISABLED-74I` | any user | disabled invite denied | yes |
| `/private/QA-MAX-74I` | any user | max-use invite denied | yes |
| `/sponsor/dashboard` | sponsor states | onboarding/payment/command center gates correct | yes |
| `/kyc` | premium pending/verified | KYC state visible, no fake approval | yes |
| `/prediction-arena` | DoroCoin/no-DoroCoin users | feature copy safe, DoroCoin-only | yes |
| `/challenges/qa-prediction-eligible/prediction` | DoroCoin user | stake fee/net pool visible, server-side deduction only | yes |
| `/rewards` | points/spin users | points and tier progress visible | yes |
| `/rewards/wheel` | spin-credit/no-credit users | tier wheels and no-credit state correct | yes |
| `/rewards/history` | spin history fixture | pending fulfillment visible | yes |
| `/revenue-share` | public/role accounts | split and admin-review-only copy clear | yes |
| `/admin` | admin | admin shell loads and QA records visible | yes |
| `/admin/predictions` | admin | prediction foundation visible | yes |
| `/admin/rewards` | admin | reward fulfillment foundation visible | yes |
| `/admin/rewards/prize-wheel` | admin | prize manager foundation visible | yes |

## Upload matrix

After publishing Storage rules in staging/control environment, test:

| Upload area | Valid image | Valid video | Invalid type | Oversized | Replace | Remove | Refresh | Failure state |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Free basic cover | required | N/A | required | required | required | required | required | required |
| Paid creator cover | required | N/A | required | required | required | required | required | required |
| Paid creator media | required | required | required | required | required | required | required | required |
| Submission image | required | N/A | required | required | required | required | required | required |
| Submission video | N/A | required | required | required | required | required | required | required |
| Sponsor logo | required | N/A | required | required | required | required | required | required |
| Sponsor banner | required | N/A | required | required | required | required | required | required |
| Profile avatar | required | N/A | required | required | required | required | required | required |
| Profile cover | required | N/A | required | required | required | required | required | required |
| Host/event media | required | required | required | required | required | required | required | required |
| Reward prize image | required | N/A | required | required | required | required | required | required |

Pass criteria:

- no user-facing URL field for normal media
- preview appears
- progress appears
- invalid/oversized file rejected
- failed upload blocks broken record creation
- saved media displays after refresh
- user cannot upload into another user's path
- private media not public unless approved/intended

## Cleanup plan

Cleanup command:

```powershell
node --experimental-strip-types scripts/seed-phase-7-4i-qa.ts --apply --cleanup
```

Cleanup deletes only records where:

- `isQaSeed === true`
- `qaSeedBatchId === "phase_7_4i_qa"`

Cleanup allowlist:

- `qaSeedBatches`
- `users`
- `profiles`
- `challenges`
- `challengeParticipants`
- `privateChallengeInvites`
- `privateChallengeAccess`
- `sponsorProfiles`
- `doroCoinWallets`
- `predictionRecords`
- `rewardWheelPrizes`
- `rewardSpinHistory`
- `voterRewardEvents`
- `submissions`
- `revenueShareLedgers`
- `adVoteRewardLogs`

Do not delete real Auth users, real customers, real challenges, real wallets, real sponsor data, or real transactions.

## Remaining P0 blockers

- No separate staging Firebase project is configured in the repo.
- No Firebase Auth test users were created.
- Fixture script was dry-run only; no records were written.
- Firestore rules were not published to staging.
- Storage rules were not published to staging.
- Upload matrix was not executed.
- Mobile screenshots were not captured.

## Remaining P1 issues

- Admin prize wheel manager remains foundation-level.
- Ads-for-votes remains provider-off foundation.
- Approved media delivery strategy still needs final production decision.
- Storage rules may need challenge ownership and participant join checks before broad production publication.
- Browser automation remains unavailable in this environment, so manual or alternate automation screenshots are required.

## Recommended next phase

Phase 7.4J should execute the fixture script in a confirmed staging Firebase project and run the browser QA checklist.

Before Phase 7.4J, provide:

- staging Firebase project ID and confirmation it is not production
- permission to run `--apply` against staging
- Firebase Auth test user creation plan or credentials
- admin test account access
- controlled Firestore/Storage rules publication permission
- mobile screenshot method

## Validation

Because this phase added a TypeScript script, validation is required:

```powershell
pnpm.cmd typecheck
pnpm.cmd build
```

Dry-run validation already passed:

```powershell
node --experimental-strip-types scripts/seed-phase-7-4i-qa.ts --dry-run
```