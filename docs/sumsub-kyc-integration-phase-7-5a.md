# Phase 7.5A: Sumsub KYC Integration

Date: 2026-07-11

## Summary

Phase 7.5A integrates Sumsub as Challenge Suite's real KYC provider foundation for paid premium users. Free users are not forced through KYC. Premium users are marked pending KYC only after Stripe webhook-confirmed subscription entitlement, and premium-sensitive tools remain gated until Sumsub returns a trusted pass result.

Challenge Suite must never store raw government IDs, passports, driver licenses, national ID images, selfies, face scans, or liveness media in Firebase. Store only safe provider metadata and status.

Do not paste Sumsub secrets into Git, Codex, screenshots, or chat.

## Required Vercel Environment Variables

Configure these in Vercel Project Settings for production and preview/staging environments:

- `SUMSUB_APP_TOKEN`
- `SUMSUB_SECRET_KEY`
- `SUMSUB_LEVEL_NAME`
- `SUMSUB_WEBHOOK_SECRET`
- `SUMSUB_BASE_URL`

Optional:

- `SUMSUB_ENVIRONMENT=sandbox | production`
- `NEXT_PUBLIC_SUMSUB_ENABLED=true | false`

Do not commit these values. Do not print these values in logs.

## Sumsub Dashboard Setup

1. Create or select a Sumsub verification level for Challenge Suite premium users.
2. Enable government ID verification for the supported document types:
   - driver license
   - national/government ID
   - passport if allowed by the selected level
3. Enable selfie/face verification and liveness if required by the level.
4. Add WebSDK allowed domains:
   - `https://www.challengesuite.com`
   - Vercel preview/staging domains used for QA
   - local development URL only if needed for sandbox testing
5. Create webhook secret and configure the webhook endpoint.

## Webhook Endpoint

Add this webhook URL in Sumsub:

`https://www.challengesuite.com/api/kyc/sumsub/webhook`

Required webhook events should include applicant review/status changes that contain applicant ID, external user ID, review status, and review result. The implementation verifies signatures and rejects unsigned or invalid requests.

## External User ID

Challenge Suite uses the Firebase UID as Sumsub `externalUserId`.

Applicant mapping is stored as metadata only:

- `kycMetadata/{uid}.sumsubApplicantId`
- `users/{uid}.sumsubApplicantId`
- `profiles/{uid}.sumsubApplicantId`

Do not create duplicate applicants if an applicant ID already exists.

## API Routes

### `POST /api/kyc/sumsub/start`

- Requires authenticated and email-verified user.
- Free users receive a `not_required` response.
- Premium users can create or reuse a Sumsub applicant.
- Returns short-lived WebSDK `accessToken`, `applicantId`, `levelName`, and `expiresAt`.
- Never returns app token, secret key, or webhook secret.
- Updates KYC metadata to `in_progress` or keeps `pending_review`.

### `GET /api/kyc/sumsub/status`

- Requires authenticated and email-verified user.
- Returns safe KYC metadata only.
- Never returns secrets or raw identity data.

### `POST /api/kyc/sumsub/webhook`

- Public endpoint with required Sumsub signature verification.
- Idempotent using Sumsub event ID or stable deterministic ID.
- Updates KYC metadata from trusted provider payloads.
- Writes an admin audit log.
- Does not fake approval.
- Does not store raw provider PII or identity media.

## Status Mapping

Challenge Suite statuses:

- `not_required`
- `required`
- `not_started`
- `in_progress`
- `pending_review`
- `verified`
- `rejected`
- `expired`
- `needs_resubmission`
- `provider_not_configured`
- `provider_error`

Safe Sumsub mapping:

- `reviewAnswer: GREEN` -> `verified`
- `reviewAnswer: RED` + retry style rejection -> `needs_resubmission`
- `reviewAnswer: RED` + final rejection -> `rejected`
- pending/review/on-hold states -> `pending_review` or `in_progress`
- expired session/token -> `expired`
- provider/API failure -> `provider_error`

Never mark a user verified unless Sumsub sends a trusted pass result.

## Premium Pending KYC Flow

Stripe remains the source of truth for payment and subscription entitlement.

When Stripe webhook confirms an active paid user subscription:

- `kycRequired: true`
- `kycStatus: required` unless already `verified`
- `premiumAccessState: pending_kyc` unless already verified
- `kycProvider: sumsub`

Premium pending KYC users can still access free/basic features, dashboard, `/kyc`, `/kyc/start`, and `/kyc/status`.

Premium pending KYC users must remain gated from:

- withdrawals
- real-money Prediction Arena
- revenue release claims
- high-risk monetization tools
- sponsor/host money movement
- anything that legally requires identity verification

## Frontend Flow

Routes updated or improved:

- `/kyc`
- `/kyc/start`
- `/kyc/status`
- `/kyc/success`
- `/kyc/failed`

The browser receives only a short-lived Sumsub WebSDK access token from the backend. The frontend loads Sumsub WebSDK and handles:

- opened session
- submitted session
- applicant status changed
- provider error
- token refresh by calling the backend again

If Sumsub is not configured, the UI shows:

`KYC provider is not configured yet.`

## Admin KYC Dashboard

Admin KYC records expose safe metadata only:

- user ID
- account plan where available
- KYC status
- Sumsub applicant ID
- submitted date
- verified/rejected date
- safe rejection label/reason
- provider status
- session ID
- raw identity stored: false

Admin does not see raw ID photos, face scans, passports, liveness media, or secret keys.

The safer default remains: admins cannot mark KYC verified without Sumsub provider result.

## Firestore and API Security Notes

Firestore rules keep direct client access denied for:

- `kycMetadata`
- `sumsubWebhookEvents`
- admin audit logs
- financial ledgers
- protected premium/revenue collections

Users can read their KYC status only through authenticated server APIs. Users cannot directly edit their own KYC status, applicant IDs, webhook results, provider status, or verification outcome.

## Sandbox QA Checklist

1. Configure Sumsub sandbox env vars in Vercel preview/staging.
2. Confirm `/kyc/status` shows `not_required` for Free user.
3. Confirm Stripe test subscription webhook marks paid Creator/Host user `pending_kyc`.
4. Confirm `/kyc/start` returns provider-not-configured state when env vars are missing.
5. Configure Sumsub sandbox env vars.
6. Start Sumsub WebSDK session as premium pending KYC user.
7. Complete sandbox verification.
8. Confirm webhook updates status to `pending_review`, then `verified` or `needs_resubmission`.
9. Confirm no raw ID/media is written to Firebase.
10. Confirm real-money Prediction Arena remains blocked until `kycStatus === verified`.
11. Confirm withdrawals remain review-only and require verified KYC.
12. Confirm duplicate webhook delivery is ignored/idempotent.

## Production Checklist

- Legal/compliance approves KYC flow and retention policy.
- Sumsub production level is configured.
- WebSDK production domain is allowlisted.
- Webhook secret is configured in Sumsub and Vercel.
- Stripe webhook has been tested to mark paid users pending KYC.
- Firestore rules are manually published only after staging QA.
- Storage rules are not broadly published until upload QA passes.
- Admin team understands that manual KYC fake approval is disabled.

## Remaining Risks

- Real Sumsub sandbox credentials are still required for end-to-end testing.
- WebSDK behavior must be browser-tested with real premium test users.
- Webhook signature header naming should be verified against the exact Sumsub dashboard payload setting.
- Production legal review is required before launch.
- Rules should not be manually published to production until controlled staging QA passes.
