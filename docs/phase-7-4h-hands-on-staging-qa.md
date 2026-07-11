# Phase 7.4H: Hands-on Staging QA Execution, Test Accounts, Upload Matrix, Rules Publication Trial, and Mobile Screenshots

## Executive summary

Phase 7.4H was requested as a hands-on staging QA execution pass. The repository preflight passed and production deployment metadata was confirmed, but true hands-on staging QA could not be executed because the required staging credentials, Firebase staging publication target, test accounts, seeded fixtures, and browser screenshot pathway were not available in this thread.

Result: **execution blocked; staging QA plan and exact fixture/account requirements documented.**

No application code was changed. No Firebase rules were published. No payouts, withdrawals, refunds, sponsor releases, prize releases, KYC approvals, raw ID/face scan storage, DoroCoin-to-cash conversion, real-money betting, fake ad vote rewards, Prediction Arena settlement, or high-value reward fulfillment were activated.

## Deployed SHA confirmation

Vercel production deployment was inspected through the Vercel connector.

- Project: `challenge-suite`
- Project ID: `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`
- Latest production deployment: `dpl_CjJkeWJQuETqGHLf6rJ7Y1ciVQtn`
- Ready state: `READY`
- Production target: `production`
- Confirmed Git commit: `4169d76c750492f101eb55f1cb6213b2cc89a2d5`
- Commit message: `Add controlled staging QA report`

Public route smoke test against `https://www.challengesuite.com`:

| Route | HTTP result |
| --- | ---: |
| `/landing` | 200 |
| `/challenges` | 200 |
| `/challenges/create` | 200 |
| `/my-challenges` | 200 |
| `/sponsor/dashboard` | 200 |
| `/rewards` | 200 |
| `/rewards/wheel` | 200 |
| `/prediction-arena` | 200 |
| `/revenue-share` | 200 |
| `/private` | 200 |
| `/admin` | 200 |

These smoke checks confirm route shells load. They do not prove credentialed access, upload success, rule behavior, or account-state correctness.

## Test account matrix

No real/staging credentials were available, so test accounts were not created or exercised. Do not use real customer data. The following staging Auth users and Firestore records are required before execution.

| Test identity | Firebase Auth requirement | Firestore profile/account requirements | Purpose |
| --- | --- | --- | --- |
| Free user 0 challenges | verified test email/password | `accountType: competitor`, free/effective tier, zero free basic challenge records | create first free challenge |
| Free user 1 challenge | verified test email/password | same as free, one lifetime free basic public challenge owned | create second challenge |
| Free user 2 challenges | verified test email/password | same as free, two lifetime free basic public challenges owned | create third challenge |
| Free user 3 challenges | verified test email/password | same as free, three lifetime free basic public challenges owned | confirm upgrade gate and server rejection |
| Paid Creator | verified test email/password | creator account, active creator subscription/effective tier | advanced creator tools/upload/private/revenue visibility |
| Paid Creator pending KYC | verified test email/password | active creator subscription, `kycRequired: true`, `kycStatus: pending_review` or `not_started` | KYC gate check |
| Paid Creator KYC verified | verified test email/password | active creator subscription, `kycStatus: verified` if provider metadata allows | post-KYC creator path |
| Paid Host | verified test email/password | host account, active host subscription/effective tier | host/event/tournament upload paths |
| Paid Host pending KYC | verified test email/password | active host subscription, KYC pending metadata | host KYC gate check |
| Sponsor not submitted | verified test email/password | sponsor account, `sponsorStatus: not_submitted`, `paymentStatus: unpaid` | onboarding start |
| Sponsor pending review | verified test email/password | sponsor profile `pending_review` | status gate |
| Sponsor approved unpaid | verified test email/password | sponsor profile `approved`, payment `unpaid` | payment prompt |
| Sponsor approved paid | verified test email/password | sponsor profile `approved`, payment `active` | sponsor command center |
| Admin | verified test email/password | custom claim/admin allowlist/admin profile flag | admin/prize/reward/rules QA |
| User with DoroCoins | verified test email/password | `doroCoinWallets/{uid}.balance > 0` | Prediction Arena success path |
| User with no DoroCoins | verified test email/password | `doroCoinWallets/{uid}.balance = 0` | insufficient balance path |
| User with reward points | verified test email/password | `users/{uid}.voterPoints >= 100` | rewards progress UI |
| User with spin credits | verified test email/password | `rewardSpinCreditsByTier` with basic/standard/premium credits | spin flow |
| User with no spin credits | verified test email/password | no spin credits | no-credit wheel state |
| Private invite access user | verified test email/password | valid invite access record for private challenge | private challenge allowed |
| Private no-access user | verified test email/password | no invite/access record | private challenge denied |

Required seeded challenge fixtures:

- public challenge owned by Creator/Host with Prediction Arena eligible participants
- public challenge with 100 approved/active participants
- private challenge with valid invite
- private challenge with expired invite
- private challenge with disabled invite
- private challenge with max-use invite already exhausted
- challenge with accepted image submission type
- challenge with accepted video submission type if video is supported

Required reward fixtures:

- server-confirmed DoroCoin purchase event or test webhook simulator
- user crossing 100 point threshold
- user crossing 250 point threshold
- user crossing 500 point threshold
- user with Basic/Standard/Premium spin credits
- reward/prize records by tier, including manual/high-value prize

## Controlled Firebase rules trial plan

No rules were published in this phase.

Recommended controlled order:

1. Confirm a separate staging Firebase project exists.
2. Back up current staging Firestore and Storage rules.
3. Publish `firestore.rules` to staging only.
4. Test public reads, authenticated reads, server API writes, admin-only denials, private challenge denials, wallet/revenue/prediction/reward denials.
5. Publish `storage.rules` to staging only.
6. Execute upload matrix with all account states.
7. Verify private media is not publicly readable.
8. Roll back if any core authenticated flow breaks.
9. Do not publish broadly to production until the upload matrix passes.

Rollback plan:

- Keep previous Firebase rules open in a separate file or console tab.
- If staging blocks a required user flow, immediately restore the prior staging rules.
- Do not loosen sensitive collections globally; patch the narrow missing path or server API instead.
- Re-run the failing flow after each patch.

What might break:

- Client-side media uploads if a path does not match `storage.rules` exactly.
- Public profile images if profile media public read behavior is intentionally changed later.
- Sponsor media display if uploaded URLs require authenticated reads and the UI expects public image delivery.
- Challenge cover display if media is stored in authenticated-only draft paths and later rendered publicly without a signed/server-mediated URL.
- Any feature still relying on direct client reads of collections now designed to be server/API-only.

Staging project requirement:

If no separate staging Firebase project exists, that is a **P0 operational blocker**. Do not trial these rules directly against broad production without a controlled rollback window and test accounts.

## Upload matrix result

Real upload execution was not run because staging accounts and controlled Storage publication were unavailable.

| Upload target | Valid image | Valid video | Invalid type | Oversized | Replace | Remove | Refresh after save | Failure state | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Free basic challenge cover | Not run | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Paid Creator challenge cover | Not run | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Paid Creator challenge media | Not run | Not run | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Submission image | Not run | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Submission video | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Sponsor logo | Not run | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Sponsor banner | Not run | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Profile avatar | Not run | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Profile cover | Not run | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Host/event media | Not run | Not run | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |
| Reward prize image | Not run | N/A | Not run | Not run | Not run | Not run | Not run | Not run | Blocked |

Expected pass criteria:

- upload button replaces normal user-facing URL input
- preview appears
- progress appears
- invalid file type rejected
- oversized file rejected
- replace/remove works
- failed upload does not create broken record
- saved uploaded media displays after refresh
- users cannot upload into another user's path
- private media is not publicly readable unless approved/intended

## Free user 3 lifetime challenge result

Hands-on execution was not run. Required staging tests:

| State | Expected | Result |
| --- | --- | --- |
| 0/3 used | dashboard counter, Create Challenge visible, server creation allowed | Blocked |
| 1/3 used | dashboard counter, Create Challenge visible, server creation allowed | Blocked |
| 2/3 used | dashboard counter, Create Challenge visible, server creation allowed | Blocked |
| 3/3 used | upgrade gate visible, 4th server create rejected | Blocked |

Locked tools to verify for Free Basic Challenges:

- private challenge
- paid entry
- prize pool
- sponsorship
- tournament mode
- live event mode
- revenue sharing
- Prediction Arena management
- premium analytics
- boosts
- host tools

## Sponsor QA result

Hands-on execution was not run. Required staging tests:

- `brand.com`
- `www.brand.com`
- `https://brand.com`
- `http://brand.com`
- sponsor logo upload
- sponsor banner upload
- preview after upload
- save and redirect
- profile display after refresh
- broken upload error
- normal user blocked from sponsor tools
- approved/unpaid payment prompt
- approved/paid command center
- all sponsor status states
- all sponsor payment states

Result: blocked pending sponsor test accounts and controlled Storage rules trial.

## Participant directory result

Hands-on execution was not run. Required staging tests:

- public challenge with 100 approved/active participants
- count shows 100
- names and avatars display
- profile links open public profiles
- search/filter works
- load more/pagination works
- no page break on desktop/mobile
- pending/rejected/flagged participants hidden publicly
- private challenge participants visible only to authorized users

Public-safe fields only:

- no email
- no phone
- no KYC status
- no wallet data
- no internal notes
- no moderation/risk flags
- no private submission data

Result: blocked pending seeded participant fixture.

## Private invite result

Hands-on execution was not run. Required fixtures/tests:

- valid invite code grants access
- invalid code fails cleanly
- expired code fails cleanly
- disabled code fails cleanly
- max-use code fails after limit
- invite use count increments
- invite access record is created
- private challenge absent from public discovery
- private participant list visible only to authorized users

Result: blocked pending private challenge invite fixtures.

## Prediction Arena result

Hands-on execution was not run. Required staging tests:

- card appears near challenge engagement/chat/voting
- user selects participant
- stake input works
- 7% platform fee displays
- net pool displays
- insufficient DoroCoin state works
- DoroCoins lock/deduct server-side only
- prediction closes before challenge start
- no cash betting language
- no DoroCoin-to-cash conversion
- no automatic settlement
- admin review only

Public language restriction:

- allowed: `Prediction Arena`
- forbidden in public UI: `betting`, `bet`, `gambling`, `cash wager`

Result: blocked pending DoroCoin test users and eligible challenge fixture.

## Rewards and prize wheel result

Hands-on execution was not run. Required staging tests:

- server-confirmed DoroCoin purchase creates points
- frontend-only success does not create points
- 100 points grants Basic spin
- 250 points grants Standard spin
- 500 points grants Premium spin
- credits are tier-specific
- user cannot self-grant points
- user cannot self-grant spin credits
- Basic wheel shows Basic prizes
- Standard wheel shows Standard prizes
- Premium wheel shows Premium prizes
- spin history is created
- manual/high-value prize is pending fulfillment
- admin can review fulfillment foundation

Result: blocked pending DoroCoin purchase webhook/test record and reward fixtures.

## Ads-for-votes result

Hands-on execution was not run. Expected staging tests:

- if provider not configured, UI says ads are not available
- fake client completion does not grant vote
- server requires provider verification
- daily limit/cooldown foundation is respected where implemented
- ad reward log appears where implemented
- no fake ad vote rewards

Result: blocked pending signed-in account and provider/off state confirmation.

## Revenue sharing result

Public route `/revenue-share` returned HTTP 200. Hands-on account-specific checks were not run.

Required staging checks:

- challenge detail revenue copy
- host dashboard revenue copy
- sponsor dashboard revenue copy
- admin revenue area if present
- 65% winners
- 15% host
- 10% sponsor
- 10% platform
- initial prize/sponsor prize remains 100% winners
- challenger vote-revenue bonus is separate
- all releases pending/admin-review only
- no payout execution
- no sponsor release
- no prize release
- no withdrawal execution
- no DoroCoin-to-cash conversion

Result: route smoke passed; hands-on role-specific verification blocked.

## Mobile screenshot result

Mobile screenshots were not captured. Browser automation had previously been blocked by local environment permissions, and no alternate manual screenshot set was provided.

Manual screenshot checklist remains required for:

- 360px
- 390px
- 430px
- 768px
- 1024px
- desktop

Pages:

- `/landing`
- `/challenges`
- `/challenges/create`
- `/challenges/[id]`
- `/my-challenges`
- `/sponsor/dashboard`
- `/rewards`
- `/rewards/wheel`
- `/prediction-arena`
- `/revenue-share`
- `/private`
- `/admin`

Check:

- upload fields usable
- participant list usable
- Prediction Arena card fits
- rewards wheel fits
- sponsor upload fields fit
- admin tables usable
- no serious horizontal overflow
- no clipped buttons
- no broken modals/forms

## Remaining P0 blockers

- No separate staging Firebase project was confirmed.
- No staging/test account credentials were available.
- Firestore rules were not trial-published in staging.
- Storage rules were not trial-published in staging.
- Upload matrix was not executed.
- Private invite and participant visibility fixtures were not seeded/tested.
- DoroCoin purchase/reward webhook test fixture was not available.
- Mobile screenshots were not captured.

## Remaining P1 issues

- Admin prize wheel manager remains foundation-level and needs workflow QA.
- Ads-for-votes remains provider-foundation only.
- Sponsor upload and state-gate QA still needs real sponsor accounts.
- Prediction Arena balance, closure, and admin-review states need fixture QA.
- Approved media delivery strategy needs final confirmation.
- Storage rules may need stronger challenge ownership and participant-join checks before broad production upload launch.

## Rule publication recommendation

Firestore rules:

- Not ready for broad production publication.
- Ready only for controlled staging/manual QA once staging test accounts and rollback plan exist.

Storage rules:

- Not ready for broad production publication.
- Ready only for controlled staging upload QA.
- Do not broaden until the upload matrix passes and public/private media delivery is confirmed.

Recommended order:

1. Establish separate staging Firebase project or controlled QA window.
2. Back up existing rules.
3. Publish Firestore rules to staging.
4. Test public/auth/admin boundaries.
5. Publish Storage rules to staging.
6. Execute upload matrix.
7. Capture mobile screenshots.
8. Patch only narrow failures.
9. Re-run failed flows.
10. Prepare production publication checklist.

## Recommended next phase

Phase 7.4I should be **Staging Fixture Creation and Credential Execution**.

Required before 7.4I:

- staging Firebase project confirmation
- Firebase/Auth test accounts or permission to create them
- admin test account access
- controlled rules publication permission
- seed data plan approval
- safe DoroCoin purchase webhook/test-event method
- mobile screenshot tool or manual screenshot operator

## Validation

No code changes were made in Phase 7.4H. This phase created documentation only.

Typecheck/build were not run because documentation-only changes do not affect compiled output.