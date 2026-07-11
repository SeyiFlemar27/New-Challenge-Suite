# Phase 7.5E: KYC, Creation Flow, Hybrid Builder, and Sumsub Browser QA

## Deployment Verification

Production deployment was confirmed through the Vercel connector.

- Project: `challenge-suite`
- Production deployment state: `READY`
- Expected commit: `6a50136`
- Deployed commit: `6a501366f4cac0a4da7cd15c342614dccafc813a`
- Commit message: `Polish KYC UX and split creation flows`

Direct HTTP smoke checks against `https://www.challengesuite.com` returned `200` for all target routes:

- `/kyc`
- `/kyc/start`
- `/kyc/status`
- `/kyc/success`
- `/kyc/failed`
- `/challenges/create`
- `/private/create`
- `/live/create`
- `/tournaments/create`
- `/hybrid/create`
- `/host/challenges/create`
- `/host/private/create`
- `/host/live/create`
- `/host/tournaments/create`
- `/host/hybrid/create`
- `/sponsor/campaigns/create`

Some app-shell/client-rendered pages do not expose their final text in raw HTML, so visual/browser-state checks still require a real browser session with credentials. Static success/failure pages did expose expected text markers.

## KYC UX QA

### `/kyc`

Source review confirms the overview page uses the new production-style verification layout:

- `Verify your identity` hero
- status pill mapping
- government ID card
- face verification card
- secure Sumsub review card
- premium tools unlock card
- trust/security section
- copy confirming Challenge Suite stores only status/provider metadata, not raw ID or face media

Credentialed browser visual QA is still required to confirm final rendering after auth/client hydration.

### `/kyc/start`

Source review confirms the start page includes:

- `Start identity verification` heading
- before-launch checklist
- `Continue to secure verification` CTA
- no large blank SDK panel before launch
- safety note that KYC does not automatically trigger payouts, withdrawals, refunds, sponsor releases, prize releases, or Prediction Arena settlement

### `/kyc/status`

Source review confirms `KycStatusPageContent` maps every status through user-friendly copy and CTAs.

Covered states:

- `not_required`
- `required`
- `not_started`
- `in_progress`
- `pending_review`
- `verified`
- `rejected`
- `needs_resubmission`
- `expired`
- `provider_error`
- `provider_unavailable`

### `/kyc/success`

Live raw HTML exposed expected success text markers:

- `Identity verified`
- no automatic payout/release promise copy

### `/kyc/failed`

Live raw HTML exposed expected recovery text markers:

- `Verification needs attention`
- `Try Again`

The page includes user-facing recovery tips and does not expose raw provider payloads.

## Provider Unavailable Fallback QA

Source review confirms visible KYC UI maps provider issues to:

`Verification is temporarily unavailable`

The raw phrase `Provider Error` was not found in KYC UI files. The legacy API message `KYC provider could not be reached` remains in `app/api/kyc/sumsub/start/route.ts` as a server response, not the primary visible KYC page headline. The Sumsub panel converts failed start/SDK states into polished retry/support copy.

## Sumsub WebSDK Launch QA

Source review confirms:

- `/api/kyc/sumsub/start` is called only when the user clicks the launch CTA.
- The client receives a short-lived backend-generated access token.
- `sumsub-websdk-container` is rendered only when `required && configured && sdkReady`.
- Loading state shows `Preparing secure verification` instead of a blank panel.
- Token refresh requests go back through `/api/kyc/sumsub/start`.
- Provider and SDK errors show polished fallback copy.

Blocked for hands-on QA:

- premium pending KYC credentials were not available in this task
- Sumsub sandbox WebSDK session was not launched live
- browser devtools secret inspection was not performed

Required next manual test:

1. Sign in as premium pending KYC user.
2. Open `/kyc/start`.
3. Click `Continue to secure verification`.
4. Confirm `/api/kyc/sumsub/start` returns a short-lived token and no secrets.
5. Confirm Sumsub WebSDK opens and records applicant reuse/create behavior.

## Selector Removal QA

Source scan confirms the old active builder selector was not found:

- no `selectButtons("competitionType"` render call
- no old `competitionType: ["Online Challenge", "Private Challenge", "Live Event", "Tournament", "Hybrid Competition"]` options array

The terms `Online Challenge`, `Private Challenge`, `Live Event`, `Tournament`, and `Hybrid Competition` remain only where appropriate as route context, page titles, navigation labels, review summaries, or feature copy.

## Dedicated Creation Routes QA

All dedicated routes returned `200` in production.

### `/challenges/create`

Expected normal/free/basic challenge builder route is live. Source review confirms this flow focuses on public/basic challenge creation and does not expose the broad type selector.

### `/private/create`

Route is live and points to the private creation context. Full lock/upgrade behavior still needs credentialed Free/Creator/Host tests.

### `/live/create`

Route is live and points to live-event creation context. Source review confirms live-event fields are section-based rather than selected from a generic type selector.

### `/tournaments/create`

Route is live and points to tournament creation context. Source review confirms tournament-specific context and review-safe foundations.

### `/hybrid/create`

Route is live and uses the dedicated Hybrid builder.

### Host routes

All Host create routes returned `200`:

- `/host/challenges/create`
- `/host/private/create`
- `/host/live/create`
- `/host/tournaments/create`
- `/host/hybrid/create`

### Sponsor route

`/sponsor/campaigns/create` returned `200` and source review confirms it is sponsor-campaign focused, not a normal challenge-type selector.

## Hybrid Competition QA

Source review confirms Hybrid Competition is meaningfully distinct from a normal challenge.

Hybrid builder includes:

- dedicated title: `Create Hybrid Competition`
- copy: `Hybrid competitions combine online submissions with a live, scheduled, or judged final stage.`
- online qualification step
- shortlist rules step
- final round step
- scoring and judges step
- media step
- review and publish step

Field foundations include:

- online submission start
- online submission deadline
- accepted media type
- qualification method
- max submission length/duration
- max file size
- number of finalists
- finalist announcement date
- advancement rules
- final round type
- final date/time
- venue/location
- external livestream link/status
- final requirements
- audience vote weight
- judge score weight
- host review weight
- tie-breaker rule
- judge names/emails foundation
- judge scoring criteria
- score visibility
- final winner/admin review flow

No payout, refund, or prize release behavior is enabled.

## Sidebar and Menu QA

Source review confirms route alignment:

### Free/starter/mobile non-host

- `Create Challenge` routes to `/challenges/create`.

### Creator

- `Create Challenge` routes to `/challenges/create`.
- `Create Private Challenge` routes to `/private/create`.

### Host/Enterprise

- `Create Challenge` routes to `/host/challenges/create`.
- `Create Private Challenge` routes to `/host/private/create`.
- `Create Live Event` routes to `/host/live/create`.
- `Create Tournament` routes to `/host/tournaments/create`.
- `Create Hybrid` routes to `/host/hybrid/create`.

### Sponsor

- Sponsor dashboard navigation includes `/sponsor/campaigns/create` in the source branch committed for Phase 7.5D.
- Browser verification still needs a sponsor account.

## Locked Feature QA

Source review confirms upgrade-oriented locked copy remains in the free/basic create flow, including:

`Private Challenges are a Creator feature. Upgrade to Creator to create invite-only challenges with access approval.`

Credentialed QA still needs seeded states for:

- Free user private locked view
- Creator private monthly limit reached
- Host live/hybrid access
- Sponsor/enterprise-specific navigation states

## Mobile QA

Automated viewport screenshots were not captured in this phase. Static/source review indicates:

- KYC cards use responsive grid/stacking classes.
- Sumsub loading state uses compact card layout.
- Create steppers use horizontal overflow scrolling.
- Hybrid builder fields use responsive grids.
- Route smoke passed for all mobile-target pages.

Manual browser screenshot QA is still required at:

- 360px
- 390px
- 430px
- 768px
- 1024px
- desktop

Target pages:

- `/kyc`
- `/kyc/start`
- `/kyc/status`
- `/kyc/success`
- `/kyc/failed`
- `/challenges/create`
- `/private/create`
- `/live/create`
- `/tournaments/create`
- `/hybrid/create`
- `/host/challenges/create`
- `/host/private/create`
- `/host/live/create`
- `/host/tournaments/create`
- `/host/hybrid/create`
- `/sponsor/campaigns/create`

## Security Review

Source scan findings:

- Sumsub app token, secret key, and webhook secret are referenced only as environment variable names in server/docs contexts; no secret values were found.
- No raw ID document storage was added.
- No raw selfie/face scan storage was added.
- No fake KYC approval was added.
- Webhook verification and idempotency code from Phase 7.5A remains in place.
- No payout execution was added.
- No withdrawal execution was added.
- No refund execution was added.
- No sponsor release was added.
- No prize release was added.
- Real-money Prediction Arena remains gated by compliance/provider/admin rules from prior phase foundations.

Firestore and Storage rules were not published.

## Remaining P0 Blockers

- Real premium pending KYC credentials are still needed for hands-on Sumsub WebSDK browser QA.
- Sumsub sandbox provider setup must be exercised end-to-end from the live site.
- Mobile screenshots were not captured.
- Credentialed role-specific creation-route QA remains incomplete.

## Remaining P1 Issues

- Private challenge monthly-limit state needs seeded Creator test data.
- Sponsor campaign route needs sponsor-account browser QA.
- Hybrid builder needs fixture-based create/save QA.
- Enterprise section-based creation remains foundation/documented rather than a complete enterprise-specific builder suite.
- Browser devtools verification should confirm no Sumsub secrets in client network responses during real WebSDK launch.

## Recommended Next Phase

Phase 7.5F should run hands-on credentialed QA with:

- Free user
- Creator user
- Host user
- Sponsor user
- Premium pending KYC user
- Sumsub sandbox test applicant
- mobile screenshot capture
- successful and failed Sumsub sandbox verification events
- private challenge limit fixtures
- hybrid builder save/publish test fixture

## Validation

No application code was changed in Phase 7.5E. This was a documentation-only QA report, so `pnpm.cmd typecheck` and `pnpm.cmd build` were not rerun.