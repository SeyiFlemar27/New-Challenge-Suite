# Phase 7.4G: Controlled Staging QA, Upload Matrix, Rules Publication Readiness, and Credentialed User Testing

## Executive summary

Phase 7.4G was intended to complete credentialed browser QA for uploads, account states, participant visibility, Prediction Arena, rewards, ads-for-votes, revenue sharing, and rules readiness.

Result: **deployment and code/rules readiness were verified, but full credentialed QA is still blocked by missing staging/test account access and unpublished Storage/Firestore rule state.**

The Vercel connector confirmed production is currently deployed at commit:

`cda845b8b65ca173ed56b1b929c4851a2fefe69e`

This is the Phase 7.4F commit: `Add upload QA report and storage rule path fixes`.

No payout, withdrawal execution, refund, sponsor release, prize release, fake KYC approval, raw ID/face storage, DoroCoin-to-cash conversion, real-money betting, fake ad vote reward, automatic Prediction Arena settlement, or automatic high-value reward fulfillment was activated.

## Deployment verification

Vercel project metadata:

- Project: `challenge-suite`
- Project ID: `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`
- Production deployment: `dpl_8En9kM8j6a2Pra98ScZccCG2UqBg`
- Deployment state: `READY`
- Production aliases include:
  - `www.challengesuite.com`
  - `challengesuite.com`
  - `challenge-suite.vercel.app`
- Confirmed Git commit SHA: `cda845b8b65ca173ed56b1b929c4851a2fefe69e`
- Commit message: `Add upload QA report and storage rule path fixes`

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

A `200` for protected routes only confirms the app shell loads. It does not prove access is allowed or blocked correctly inside the browser; credentialed browser QA is still required.

## Test account matrix

Credentialed QA could not be completed because usable staging/test credentials were not available in this run. The following accounts/fixtures are required before rules publication:

| Account or fixture | Required state | Status |
| --- | --- | --- |
| Free user | 0 lifetime basic challenges | Needed |
| Free user | 1 lifetime basic challenge | Needed |
| Free user | 2 lifetime basic challenges | Needed |
| Free user | 3 lifetime basic challenges | Needed |
| Paid Creator | active plan, KYC state known | Needed |
| Paid Host | active plan, KYC state known | Needed |
| Sponsor | not_submitted | Needed |
| Sponsor | pending_review | Needed |
| Sponsor | approved + unpaid | Needed |
| Sponsor | approved + paid | Needed |
| Admin | admin access enabled | Needed |
| User with DoroCoins | positive DoroCoin balance | Needed |
| User without DoroCoins | zero DoroCoin balance | Needed |
| User with reward points/spin credits | tier credits seeded/server-awarded | Needed |
| User without spin credits | no tier credits | Needed |
| Public challenge | 100 approved/active participants | Needed |
| Private challenge | valid invite, expired invite, disabled invite, max-use invite | Needed |

Recommended seeded records:

- `users` records with explicit `accountType`, `planId`, `subscriptionStatus`, `effectiveTier`-compatible fields.
- `challenges` records for public and private challenge scenarios.
- `challengeParticipants` records with approved/active and pending/rejected/flagged status variants.
- `doroCoinWallets` with positive and zero balances.
- `rewardSpinHistory` and user reward fields for Basic/Standard/Premium spin coverage.
- sponsor profile records for each sponsor status/payment state.

## Upload QA matrix

Code and rules review confirmed the upload UI and Storage path model, but real upload execution still requires signed-in accounts and a staging rule publication window.

| Upload area | Code path present | Storage path coverage | Credentialed browser result |
| --- | --- | --- | --- |
| Free basic challenge cover | Yes | `challengeMedia/drafts/{userId}/{fileName}` | Not run |
| Advanced challenge cover/media | Yes | `challengeMedia/drafts/{userId}/{folder}/{fileName}` | Not run |
| Host challenge/event media | Yes | `challengeMedia/host-drafts/{userId}/{folder}/{fileName}`, `eventMedia/host-drafts/{userId}/{folder}/{fileName}` | Not run |
| Submission image/video | Yes | `submissions/{challengeId}/{userId}/{fileName}` | Not run |
| Sponsor logo | Yes | `sponsorMedia/profile/{userId}/{folder}/{fileName}` | Not run |
| Sponsor banner | Yes | `sponsorMedia/profile/{userId}/{folder}/{fileName}` | Not run |
| Profile avatar | Yes | `profileMedia/{userId}/{folder}/{fileName}` | Not run |
| Profile cover | Yes | `profileMedia/{userId}/{folder}/{fileName}` | Not run |
| Admin prize image | Foundation | `rewardPrizeMedia/{prizeId}/{userId}/{fileName}` admin-only | Not run |

Required browser checks for each upload area:

- valid image
- valid video where supported
- invalid file type rejected
- oversized file rejected
- replace file
- remove file
- failed upload state
- preview after upload
- saved media displays after refresh
- no broken record created after failed upload
- user cannot upload into another user's path

## Storage rules readiness

Reviewed `storage.rules` after Phase 7.4F.

Confirmed path coverage:

- `challengeMedia/{challengeId}/{userId}/{fileName}`
- `challengeMedia/drafts/{userId}/{fileName}`
- `challengeMedia/drafts/{userId}/{folder}/{fileName}`
- `challengeMedia/host-drafts/{userId}/{folder}/{fileName}`
- `submissions/{challengeId}/{userId}/{fileName}`
- `sponsorMedia/profile/{userId}/{folder}/{fileName}`
- `sponsorMedia/{sponsorId}/{userId}/{fileName}`
- `profileMedia/{userId}/{fileName}`
- `profileMedia/{userId}/{folder}/{fileName}`
- `rewardPrizeMedia/{prizeId}/{userId}/{fileName}`
- `eventMedia/{eventId}/{userId}/{fileName}`
- `eventMedia/host-drafts/{userId}/{folder}/{fileName}`

Confirmed rule properties:

- bucket is not globally public
- fallback rule denies everything else
- identity document paths are denied
- image/video type allowlists exist
- image/video size limits exist
- upload paths are owner-scoped by `{userId}` where user uploads are allowed
- reward prize media writes are admin-only

Readiness judgment:

**Storage rules are not ready for broad production publication yet.** They are suitable for controlled staging publication only.

Reasons:

- Upload success/failure has not been tested with real authenticated users.
- Challenge media ownership is scoped by user path but does not verify challenge ownership through Firestore in the Storage rule itself.
- Submission media is scoped by user path but does not verify challenge join status in the Storage rule itself.
- Approved public media delivery needs a deliberate signed URL/server-mediated strategy before broad public launch.
- Profile media is publicly readable by design; confirm this matches product expectations before production publication.

## Firestore rules readiness

Reviewed `firestore.rules` for the sensitive Phase 7.4B-7.4F collections.

Protected/fail-closed direct client collections include:

- submissions
- admin audit logs
- KYC metadata
- revenue share ledgers
- private challenge invites
- prediction records
- reward spin history
- voter reward events
- ad vote reward logs
- sponsor profiles/internal sponsor records
- financial/review collections

Firestore access model remains server/API-centered for sensitive writes.

Readiness judgment:

**Firestore rules are suitable for controlled manual publication after credentialed staging QA confirms server APIs still cover the required user flows.**

Do not publish directly to broad production until:

- Free/Creator/Host/Sponsor/Admin browser flows are tested.
- Private challenge invite access is tested.
- Upload/API flows work with the rules active.
- Admin review flows still work through server-side authorization.

## Free user 3 lifetime challenge QA

Code review confirms:

- `FREE_BASIC_CHALLENGE_LIFETIME_LIMIT = 3`
- `/api/challenges/usage` returns lifetime usage fields
- `/api/challenges` rejects a 4th free basic challenge server-side
- Free basic challenge creation is limited to public, non-monetized, non-advanced challenges
- UI shows `Free Basic Challenges Used: x of 3`
- Free dashboard exposes `Create Basic Challenge` and `My Challenges`

Credentialed QA still needed:

| Scenario | Expected | Status |
| --- | --- | --- |
| Free user with 0 challenges | can create Basic Challenge | Not run |
| Free user with 1 challenge | can create Basic Challenge | Not run |
| Free user with 2 challenges | can create Basic Challenge | Not run |
| Free user with 3 challenges | sees upgrade gate | Not run |
| 4th challenge POST | rejected server-side | Not run |
| Free challenge private/prize/sponsor/tournament/live/revenue/Prediction Arena advanced options | blocked | Not run |

## Sponsor credentialed QA

Implementation review confirms:

- sponsor website URL normalization exists in the API
- sponsor logo/banner upload components are present
- logo/banner preview behavior is handled by the upload component
- sponsor status/payment copy and gates exist as foundations

Credentialed tests still needed:

- `brand.com`
- `www.brand.com`
- `https://brand.com`
- `http://brand.com`
- logo upload/save/display
- banner upload/save/display
- broken upload error state
- redirect after save
- state-specific sponsor dashboard gates
- approved/unpaid payment prompt
- approved/paid command center
- normal user sponsor tool denial

## Participant directory QA

Implementation review confirms:

- challenge detail API returns participants
- public-safe fields only are exposed
- challenge detail page has Participants section
- search/filter exists
- load-more pagination exists
- profile links exist

Credentialed/seeded QA still needed:

- challenge with 100 participants
- public challenge approved/active participants visible
- pending/rejected/flagged participants hidden from public view
- private challenge participants visible only to valid-access users/creator/host/admin
- public profiles open correctly
- no emails, phones, KYC, wallet, risk flags, admin notes, or private media are exposed

## Prediction Arena QA

Implementation review confirms:

- challenge detail has Prediction Arena card near engagement/voting area
- public copy says `Prediction Arena`
- challenge-specific prediction page has participant selection
- 7% DoroCoin platform fee is calculated
- net pool is calculated
- server checks DoroCoin balance
- server blocks closed/private challenge cases as implemented
- no cash payout or automatic settlement exists

Credentialed QA still needed:

- account with DoroCoins can submit eligible prediction
- account without DoroCoins sees insufficient balance
- DoroCoins are locked/deducted only server-side
- challenge after start is rejected
- canceled/ended challenge is rejected where data exists
- admin review foundation receives record
- prediction history/user state update is visible where supported

## Rewards and prize wheel QA

Implementation review confirms:

- DoroCoin purchase webhook awards points server-side through reward helper
- vote spending no longer awards points
- frontend-only success page does not award points
- Basic: 100 points = Basic spin
- Standard: 250 points = Standard spin
- Premium: 500 points = Premium spin
- spin credits are tracked separately by tier
- spin endpoint decrements tier-specific credit
- manual/high-value reward fulfillment remains foundation-only

Credentialed QA still needed:

- test DoroCoin purchase webhook event
- Basic threshold crossing
- Standard threshold crossing
- Premium threshold crossing
- duplicate webhook idempotency
- user without spin credits cannot spin
- spin history appears
- admin can review fulfillment foundation

## Ads-for-votes QA

Implementation review confirms:

- `/api/ad-votes` requires authentication
- if no provider is configured, response is `AD_PROVIDER_NOT_CONFIGURED`
- fake client completion does not grant votes
- ad vote foundation logs blocked attempts where implemented
- voting UI says ads are not available yet

Credentialed QA still needed:

- signed-in request to `/api/ad-votes`
- no vote increment after fake attempt
- daily limit/cooldown behavior after provider integration is designed
- admin log visibility if desired

## Revenue sharing QA

Implementation review and public route smoke confirm `/revenue-share` loads.

Revenue copy remains consistent:

- 65% winners
- 15% host
- 10% sponsor
- 10% platform
- initial prize/sponsor prize money remains 100% winner-directed after review
- challenger vote-revenue bonus is separate
- all releases are pending/admin-review only

No payout execution, sponsor release, prize release, withdrawal execution, or DoroCoin-to-cash conversion was added.

## Mobile QA

Attempted browser automation for public mobile layout smoke checks was blocked by local Codex app filesystem permissions while launching Playwright:

`EPERM: operation not permitted, lstat ...`

No mobile screenshots were captured in this run.

Public route smoke confirmed the routes load, but visual viewport QA still needs to be performed manually or with a browser environment that can launch Playwright/Chrome.

Required viewport checklist remains:

- 360px
- 390px
- 430px
- 768px
- 1024px
- desktop

Priority pages:

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

## Remaining P0 blockers

- Credentialed staging/test accounts are not available yet.
- Storage rules have not been tested in a controlled staging publication window.
- Upload matrix has not been executed with authenticated users.
- Private challenge participant visibility has not been tested with real invite/access states.
- Mobile screenshot QA has not been completed.

## Remaining P1 issues

- Sponsor upload browser QA.
- Reward tier webhook/idempotency QA.
- Prediction Arena DoroCoin balance and edge-state QA.
- Admin prize wheel manager remains foundation-level.
- Ads-for-votes remains provider-foundation only.
- Approved/public media delivery strategy needs final decision.
- Storage rules need stronger ownership checks if public production upload abuse risk must be reduced before launch.

## Manual rule publication recommendation

Recommended order:

1. Confirm staging/test Firebase project and test accounts.
2. Publish Firestore rules to staging/control environment.
3. Run account and admin flows through server APIs.
4. Publish Storage rules to staging/control environment.
5. Execute upload matrix with screenshots/results.
6. Confirm private/public media read behavior.
7. Only then consider controlled production publication.

Current recommendation:

- Firestore rules: **not yet for broad production; ready for controlled staging/manual QA publication.**
- Storage rules: **not yet for broad production; ready only for controlled staging upload QA.**

## Recommended next phase

Phase 7.4H should be a hands-on staging execution phase with real test credentials and Firebase rules published to a controlled staging target.

Required inputs before Phase 7.4H:

- Vercel dashboard access or confirmation workflow.
- Firebase staging project/rules publication target.
- test credentials for every account state in the matrix.
- seeded public challenge with 100 participants.
- seeded private challenge with invite variants.
- test DoroCoin purchase webhook event or safe simulator.
- browser automation or manual screenshot process.

## Validation

No application code was changed in Phase 7.4G. This phase created documentation only.

Typecheck/build were not rerun because documentation-only changes do not affect the compiled app.