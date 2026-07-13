# Phase 7.7B - Challenge Publish Validation, Required Fields, and Draft-vs-Publish Enforcement

## Current Publish Flow Audit

Challenge creation currently flows through `POST /api/challenges`.

- Frontend routes call `createChallenge(payload)` from `lib/api/services.ts`.
- `/challenges/create` sends `publish: false` for drafts and `publish: true` for publishing.
- Host, live, tournament, and hybrid builders in `components/host/host-competition-wizard.tsx` also call the same API.
- The API authenticates the user, blocks sponsor accounts from normal challenge creation, checks plan/role limits, resolves the initial lifecycle status, writes the challenge record, creates private invite foundation records where applicable, creates prize/revenue/cash placeholder foundations, creates a notification, and writes an audit log.
- Published advanced challenges can become `pending_review`; normal public challenges can become `scheduled`, `submission_open`, `voting_open`, or `under_review` depending on lifecycle dates.
- There is no separate active challenge edit or publish endpoint yet. `app/api/challenges/[id]/route.ts` is currently read-only.
- Admin review routes exist for broader admin workflows, but this phase did not activate an admin override publish path.

## Central Validation Architecture

`lib/server/challenge-validation.ts` now contains central validation functions:

- `validateChallengeForDraft(challenge)`
- `validateChallengeForPublish(challenge, context)`

Publish validation returns structured results:

```ts
{
  valid: boolean,
  errors: [{ code, field, step, message, severity }],
  missingCount: number,
  groupedByStep: Record<string, ValidationIssue[]>
}
```

The API uses this validator before any publish status is written. The frontend create page uses the same validator for a grouped publish checklist, while the server remains the final authority.

## Required Publish Fields

The publish validator enforces, where applicable:

- title
- complete description
- category
- challenge type
- competition format
- rules
- eligibility/terms
- submission guidelines
- accepted media type
- schedule dates
- challenge banner URL and Storage path
- visibility
- prize type
- number of winners
- winner-selection method
- live event venue/city/country for live events
- livestream URL when livestreaming is scheduled
- invite/access settings for private challenges
- tournament stage configuration for tournaments

Rules are conditional. Live-event fields are not required for normal challenges, tournament stages are not required for normal challenges, and livestream URL is required only when livestreaming is enabled/scheduled.

## Draft vs Publish Behavior

Drafts can now parse and save with incomplete publish fields. Zod parsing is used for safe field shapes, max lengths, enum values, and safe data types. Draft validation only rejects unsafe data shapes such as invalid media path shape.

Publish attempts run the full central validator and reject incomplete records before lifecycle status changes.

## Frontend Checklist Behavior

`/challenges/create` now shows a publish checklist grouped by step. Save Draft remains available when publish requirements are incomplete.

The publish button is blocked for:

- upload in progress
- failed upload
- draft-only advanced formats
- missing publish requirements

The checklist includes a “Review first item” action that routes the user to the first invalid step without clearing form data.

## Server Publish Enforcement

`POST /api/challenges` now:

1. Authenticates the user.
2. Parses draft-safe payloads.
3. Runs `validateChallengeForDraft` for all saves.
4. Runs `validateChallengeForPublish` when `publish: true`.
5. Rejects incomplete publish attempts with `PUBLISH_VALIDATION_FAILED` and structured validation details.
6. Continues existing sponsor/account/plan/free-limit/private-limit checks.
7. Resolves lifecycle status only after validation passes.
8. Writes challenge, foundations, notifications, and audit logs only after validation passes.

No paid-entry prize pool, payout, withdrawal, refund, sponsor release, or real-money settlement behavior was activated.

## Media Reference Validation

Publish validation requires a challenge banner to include both:

- `coverImageUrl`
- `coverImagePath`

The Storage path must belong to the owner draft path or challenge path:

- `challenges/drafts/{ownerUid}/...`
- `challenges/host-drafts/{ownerUid}/...`
- `challenges/hybrid-drafts/{ownerUid}/...`
- `challenges/{challengeId}/banner/...`
- `challenges/{challengeId}/trailers/...`

Optional promo/trailer paths are also checked when present. Random external URLs without Storage paths do not satisfy the required banner check.

## Date Validation Foundation

Publish validation now blocks obvious invalid schedules:

- start date in the past for non-admin publish
- start date after end date
- submission deadline after challenge start
- voting open after voting close
- voting close after challenge end
- registration close after challenge start unless late registration is enabled
- livestream access opening after challenge start

This is a publish-time foundation only. Full lifecycle resolver work remains for Phase 7.7C.

## Admin Review Behavior

This phase did not add an admin override path. Admin review/status publishing should call the same central validator before approving incomplete challenges. If an override is added later, it should require a reason, write an audit log, and still not bypass critical media ownership/security checks.

## Plan / Role / Entitlement Safety

Existing checks remain in `POST /api/challenges`:

- sponsors are blocked from normal creator/host challenge creation
- free accounts cannot publish private, live, tournament, sponsor, prize, revenue, or advanced-voting challenges
- free lifetime challenge limits remain server-enforced
- creator/host plan limits remain server-enforced
- private challenge monthly limits remain server-enforced
- paid-entry/prize-pool/money movement fields remain locked

## Tests Added

Added `scripts/test-challenge-publish-validation.mjs`.

Covered:

- incomplete draft payload parses safely
- draft validation allows incomplete publish fields
- missing banner returns structured error
- invalid date ordering is rejected
- live-event location required for live events
- livestream URL required when livestreaming is scheduled
- private invite/access settings required
- tournament stages required
- banner Storage path must belong to the challenge owner or challenge path
- complete challenge passes publish validation

## Remaining P0 Blockers

- Storage rules from Phase 7.7A still must be reviewed and deployed before live media-backed publishing can succeed.
- Existing challenge edit and admin approval endpoints should be extended to call `validateChallengeForPublish` before any future status-change mutation is activated.

## Remaining P1 Issues

- Add a dedicated publish endpoint for existing drafts.
- Add challenge edit flow with draft-safe validation.
- Add admin override flow with reason/audit trail if product policy requires it.
- Add credentialed browser QA for the publish checklist.
- Phase 7.7C should deepen lifecycle status resolution and scheduled publishing behavior.

## Recommended Next Phase

Phase 7.7C should focus on challenge lifecycle resolution, edit/publish endpoints for existing drafts, scheduled publishing, admin review status transitions, and credentialed end-to-end browser QA.
