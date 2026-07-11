# Phase 7.5B: Sumsub Sandbox QA, Premium Pending KYC Flow, and Webhook Verification

Date: 2026-07-11
Repository: `C:\Dev\New-Challenge-Suite`
Production site: `https://www.challengesuite.com`
Target commit: `098baa6`

## Deployment Verification

Vercel connector confirmed production is `READY` for commit `098baa6cce769dcd2c7c2fbf5a55bd16da23925e`.

Recent production deployment metadata:

- Project: `challenge-suite`
- Target: production
- Commit message: `Integrate Sumsub KYC verification foundation`
- Commit SHA: `098baa6cce769dcd2c7c2fbf5a55bd16da23925e`
- State: `READY`

Public KYC routes were smoke-tested:

| Route | Result |
| --- | --- |
| `/kyc` | `200` |
| `/kyc/start` | `200` |
| `/kyc/status` | `200` |
| `/kyc/success` | `200` |
| `/kyc/failed` | `200` |
| `/api/kyc/sumsub/status` logged out | `401` |
| `/api/kyc/sumsub/webhook` unsigned POST | `401` |

## Environment Variable Check

Checked through Vercel CLI without printing values. Vercel reports encrypted variables only.

| Variable | Status |
| --- | --- |
| `SUMSUB_APP_TOKEN` | configured |
| `SUMSUB_SECRET_KEY` | configured |
| `SUMSUB_LEVEL_NAME` | configured |
| `SUMSUB_WEBHOOK_SECRET` | configured |
| `SUMSUB_BASE_URL` | configured |
| `SUMSUB_ENVIRONMENT` | configured |
| `NEXT_PUBLIC_SUMSUB_ENABLED` | configured |

No secret values were printed or copied.

## Sumsub Dashboard Setup Status

Not directly accessible from this QA session. Manual confirmation is still required in the Sumsub dashboard:

- Verification level exists.
- Level name exactly matches `SUMSUB_LEVEL_NAME`.
- WebSDK allowed domain includes `https://www.challengesuite.com`.
- Webhook URL is configured as `https://www.challengesuite.com/api/kyc/sumsub/webhook`.
- Webhook secret matches the encrypted Vercel value.
- Sandbox mode is available for QA.
- Required document, selfie, and liveness checks are enabled according to the selected Sumsub level.

## Free User KYC QA

Hands-on credentialed Free user QA was not completed because no Free test credentials were available in this session.

Implementation review result:

- Free users should receive `not_required` from the KYC metadata path.
- `/api/kyc/sumsub/start` returns a not-required / upgrade-required response when `kycRequired` is false.
- UI copy supports “KYC Not Required” for non-premium users.
- Free/basic features remain separate from KYC-sensitive premium tooling.

Required credentialed test:

- Sign in as a Free user.
- Visit `/kyc`, `/kyc/start`, and `/kyc/status`.
- Confirm no Premium Pending KYC banner appears.
- Confirm free/basic actions still work.
- Confirm premium money-sensitive routes remain blocked.

## Premium Pending KYC QA

Hands-on premium user QA was not completed because no webhook-confirmed premium test user was available.

Implementation review result:

- Stripe subscription lifecycle sets paid user KYC fields through the webhook-controlled subscription path.
- Expected fields are present in code:
  - `kycRequired: true`
  - `kycStatus: required` unless already `verified`
  - `premiumAccessState: pending_kyc` unless already `verified`
  - `kycProvider: sumsub`
- Verified users are preserved and are not downgraded back to pending KYC by subscription sync.
- Dashboard shows a Premium Pending KYC banner when KYC is required and not verified.
- Wallet and revenue-share pages include KYC safety copy for future identity-sensitive release/withdrawal review.

Required credentialed test:

- Use a Stripe webhook-confirmed premium test user.
- Confirm dashboard banner appears.
- Confirm `/kyc/start` launches Sumsub once authenticated.
- Confirm premium-sensitive features remain locked until `verified`.
- Confirm free/basic participation remains available.

## Sumsub WebSDK QA

Live WebSDK launch was not completed because authenticated premium credentials were not available.

Implementation review result:

- `components/sumsub-verification-panel.tsx` loads Sumsub WebSDK client-side.
- The client requests a backend-generated access token from `/api/kyc/sumsub/start`.
- Sumsub app token, secret key, and webhook secret remain server-only.
- Token refresh calls the backend again.
- Submitted/status/error events show safe user messages.
- Provider-not-configured state displays `KYC provider is not configured yet.`

Required sandbox test:

- Authenticate as Premium Pending KYC.
- Start verification.
- Confirm applicant create/reuse.
- Confirm WebSDK opens.
- Complete sandbox verification.
- Confirm pending review status appears before webhook finalization.

## Webhook QA

Completed:

- Missing/invalid signature test: unsigned POST to `/api/kyc/sumsub/webhook` returned `401`.
- Code review confirms webhook signature verification uses `SUMSUB_WEBHOOK_SECRET` and timing-safe comparison.
- Code review confirms processed events are stored in `sumsubWebhookEvents` for idempotency.
- Code review confirms audit logs are written to `adminAuditLogs` with safe metadata.

Not completed:

- Valid signed sandbox webhook from Sumsub.
- Duplicate valid webhook replay.
- GREEN/RED sandbox status round trip.

Reason: webhook secret must not be printed or used manually from this session, and Sumsub dashboard/provider event access was not available.

## GREEN Result QA

Not executed with a live Sumsub sandbox event.

Implementation review result:

- `reviewAnswer: GREEN` maps to `kycStatus: verified`.
- `kycVerifiedAt` is set during webhook processing.
- `premiumAccessState` becomes `active` for verified status.
- Stripe subscription lifecycle preserves existing `verified` status.

Required sandbox test:

- Complete a Sumsub sandbox applicant with a GREEN result.
- Confirm `kycMetadata`, `users`, and `profiles` update to verified metadata only.
- Confirm premium KYC gates open only after the trusted webhook result.

## RED Result QA

Not executed with a live Sumsub sandbox event.

Implementation review result:

- `reviewAnswer: RED` maps to `rejected` when rejection type is final.
- Non-final RED maps to `needs_resubmission`.
- `kycRejectedAt` and safe failure reason are stored where available.
- Premium-sensitive tools remain gated.

Required sandbox test:

- Trigger a Sumsub RED sandbox result.
- Confirm user sees failed/resubmission state.
- Confirm only safe rejection label/reason is stored.

## Reviewing, Expired, and Provider Error QA

Implementation review result:

- Pending/review statuses normalize to `pending_review` or `in_progress`.
- Expired status normalizes to `expired`.
- Provider startup failures normalize to `provider_error` with safe failure copy.
- Missing provider config produces `provider_not_configured`.

Live provider-error QA was not executed because the production provider env variables are configured.

## Admin KYC QA

Hands-on admin browser QA was not completed because admin credentials were not available.

Implementation review result:

- Admin KYC overview includes metadata-only Sumsub fields:
  - user ID
  - plan ID
  - KYC required/status/provider
  - Sumsub applicant ID
  - provider status
  - review answer
  - reject type
  - submitted/verified/rejected timestamps
  - safe failure reason
  - `rawIdentityStored: false`
- Admin UI copy states no raw ID or face media is stored in Firebase.
- Existing admin controls do not provide a fake Sumsub approval path.

Required credentialed test:

- Sign in as admin.
- Visit `/admin/kyc`.
- Confirm non-admin users are blocked.
- Confirm no raw ID, selfie, face scan, or provider secrets are visible.

## KYC Gating QA

Implementation review result:

- Dashboard displays Premium Pending KYC banner for required non-verified users.
- Settings links to Identity Verification.
- Wallet/withdraw and revenue-share pages communicate KYC requirements and do not execute payouts.
- Real-money Prediction Arena remains guarded by KYC/provider/admin/region/feature gates from the previous phase.
- `/api/kyc/sumsub/status` rejects unauthenticated users with `401`.

Credentialed gating still needs hands-on testing for:

- Premium Pending KYC user.
- Verified user.
- Rejected / needs resubmission user.
- Free user.
- Direct-route attempts into KYC-sensitive money features.

## Security Review

Passed by code review and targeted live checks:

- No Sumsub secrets are exposed in frontend code.
- No Sumsub app token, secret key, or webhook secret values were printed.
- No raw government ID, selfie, or face scan storage is present.
- KYC metadata is metadata-only and sets `rawIdentityStored: false`.
- Users cannot directly edit KYC metadata through Firestore rules; `kycMetadata` remains fail-closed.
- `sumsubWebhookEvents` is fail-closed in Firestore rules.
- Webhook route rejects unsigned requests.
- Webhook processing is idempotent by event record.
- Audit logs record safe status transitions.
- No payout, withdrawal, refund, sponsor release, prize release, DoroCoin-to-cash conversion, or fake KYC approval was added.

Still required:

- Controlled Sumsub sandbox webhook replay test.
- Confirm deployed runtime has env values after the most recent Vercel deployment if any env changes were made after deployment.
- Controlled Firestore rules publication; do not publish automatically.

## Remaining P0 Blockers

- No authenticated Free/Premium/Admin test credentials were available for hands-on QA.
- No Sumsub sandbox dashboard access was available to trigger GREEN/RED webhook events.
- Valid signed webhook and duplicate replay were not executed.
- Firestore rules remain unpublished/unverified in controlled staging.
- Sumsub dashboard setup must be manually confirmed.

## Remaining P1 Issues

- Add a repeatable Sumsub sandbox fixture/test checklist for GREEN, RED, expired, pending, and duplicate webhook states.
- Add admin screenshot/browser QA for `/admin/kyc`.
- Add credentialed route-gate QA for wallet, revenue share, Prediction Arena, and money-sensitive sponsor/host tools.
- Confirm WebSDK allowed-domain behavior on production and preview domains.

## Required Manual Actions

1. Confirm Sumsub dashboard verification level name matches Vercel `SUMSUB_LEVEL_NAME`.
2. Confirm WebSDK allowed domain includes `https://www.challengesuite.com`.
3. Confirm webhook endpoint is configured as `https://www.challengesuite.com/api/kyc/sumsub/webhook`.
4. Confirm webhook secret in Sumsub matches encrypted Vercel `SUMSUB_WEBHOOK_SECRET`.
5. Create or provide sandbox test users:
   - Free user.
   - Premium Pending KYC user.
   - Admin user.
   - Sumsub GREEN scenario.
   - Sumsub RED scenario.
6. Run sandbox WebSDK completion and webhook tests.
7. Re-test KYC-sensitive feature gates after each status transition.

## Firestore Rules Publication Recommendation

Do not publish Firestore rules broadly yet.

Rules appear ready for controlled manual QA publication because KYC metadata and Sumsub webhook events are fail-closed, but production publication should wait until:

- Sumsub sandbox GREEN/RED webhooks pass.
- Credentialed Free/Premium/Admin KYC QA passes.
- Direct-route KYC gate QA passes.

## Recommended Next Phase

Phase 7.5C should execute credentialed Sumsub sandbox QA with real sandbox users and provider events:

- Premium Pending KYC WebSDK launch.
- GREEN webhook status transition.
- RED / needs resubmission transition.
- Duplicate webhook replay.
- Admin KYC dashboard review.
- KYC-sensitive route/API gate verification.
- Controlled Firestore rules publication decision.
