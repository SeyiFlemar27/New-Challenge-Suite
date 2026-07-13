# Phase 7.7C - Challenge Date/Time Lifecycle Resolver and Status Consistency

## Audit Findings

Challenge lifecycle state was being derived in several places:

- `lib/challenge-status.ts` mapped persisted status plus a small set of date fields into broad labels such as Open, Active, Voting Open, and Voting Closed.
- `lib/server/submission-lifecycle.ts` independently decided whether a challenge was joinable or submittable from persisted status and a submission deadline fallback.
- `lib/server/voting.ts` used `canVoteOnChallenge`, but that helper previously allowed some active challenges to vote without a clearly opened voting window.
- High-impact public surfaces such as challenge cards, challenge details, join, votes, watch, feed, submissions, and leaderboard helpers consumed the old helper names.
- `components/stories/trending-stories.tsx` filtered status strings directly and always displayed Participate and Vote Now CTAs.
- Some mock/mobile-preview components still display static prototype labels; those are not production enforcement points and remain P1 polish.

## Resolver Architecture

`lib/challenge-status.ts` is now the shared client-safe lifecycle resolver. It exports:

- `getChallengeLifecycleState(challenge, now, viewerContext?)`
- `normalizeChallengeDate`
- `compareChallengeDates`
- `getNextMilestone`
- `getLifecycleLabel`
- `getLifecycleAction`
- compatibility helpers including `getChallengeDisplayStatus`, `canJoinChallenge`, `canSubmitToChallenge`, and `canVoteOnChallenge`

The resolver returns structured state with primary status, participation status, submission status, voting status, livestream status, allowed actions, disabled reasons, next milestone, and timeline warnings.

## Supported Statuses

Canonical primary statuses:

- `draft`
- `pending_review`
- `scheduled`
- `registration_not_open`
- `registration_open`
- `registration_closed`
- `active`
- `submission_open`
- `submission_closed`
- `voting_not_open`
- `voting_open`
- `voting_closed`
- `under_review`
- `winners_announced`
- `completed`
- `paused`
- `postponed`
- `cancelled`

Manual terminal or override states win. Cancelled, paused, postponed, and completed challenges do not revert to active because of dates.

## Date Normalization

The resolver supports current and legacy fields:

- registration: `registrationOpensAt`, `registrationClosesAt`, `registrationDeadline`
- submission: `submissionOpensAt`, `submissionClosesAt`, `submissionDeadline`, `timeLimitedUploads`
- challenge: `challengeStartsAt`, `challengeEndsAt`, `startsAt`, `endsAt`, `startDate`, `endDate`
- voting: `votingOpensAt`, `votingClosesAt`, `votingStartsAt`, `votingDeadline`, `votingStartDate`, `votingEndDate`
- judging/winners/livestream: `judgingStartsAt`, `judgingEndsAt`, `winnersAnnouncedAt`, `livestreamStartsAt`, `livestreamEndsAt`, `externalLiveOpensAt`
- metadata: `createdAt`, `updatedAt`, `publishedAt`, `cancelledAt`, `completedAt`

Date-only fields are normalized as UTC start-of-day or end-of-day depending on the field boundary. Firebase Timestamp-like objects are accepted. Missing or reversed important timeline fields produce `timelineWarnings` instead of crashing UI rendering.

## Draft vs Publish Validation Alignment

Phase 7.7B remains the publish gate. This phase does not replace publish validation. It aligns runtime lifecycle behavior with the same date-order assumptions and adds helper exports that future publish validation work can share.

## Join and Participation State

The resolver now provides consistent join labels and disabled reasons:

- registration not open: disabled, with Registration Opens date label
- registration open: `Join Challenge`
- registration closing soon: `Join Challenge`, with closing-soon message
- registration closed before start: disabled
- active with late joining: joinable only when late joining is explicitly enabled
- active without late joining: disabled as Challenge in Progress
- ended/cancelled/paused/postponed: disabled with specific reason

`lib/server/submission-lifecycle.ts` now delegates joinability to `getChallengeLifecycleState`, so the join API and UI use the same reason source.

## Submission and Voting State

Submission states are now:

- `submissions_not_open`
- `submissions_open`
- `submissions_closed`
- `no_submission_required`

Voting states are now:

- `voting_not_open`
- `voting_open`
- `voting_closed`
- `voting_not_enabled`

The voting page, challenge detail page, `lib/server/voting.ts`, leaderboard helpers, and submissions page continue using the compatibility `canVoteOnChallenge` export, now backed by the resolver. Vote Now is no longer shown by the updated story carousel unless the resolver reports `canVote`.

## Livestream State Foundation

Livestream status is resolved as:

- `livestream_not_scheduled`
- `livestream_scheduled`
- `livestream_live`
- `livestream_paused`
- `livestream_ended`
- `replay_available`
- `replay_unavailable`

The watch page now uses the resolver for status, countdown, and live-state copy. It does not expose provider secrets or stream keys. Full Watch Live access auditing remains Phase 7.7D.

## UI Surfaces Updated

Updated directly:

- `app/challenges/[id]/page.tsx`
- `app/challenges/[id]/join/page.tsx`
- `app/challenges/[id]/votes/page.tsx`
- `app/challenges/[id]/watch/page.tsx`
- `components/stories/trending-stories.tsx`
- `lib/api/normalizers.ts` preserves raw date/status fields so normalized challenge objects still have resolver inputs.

Updated indirectly through compatibility helpers:

- challenge cards
- feed cards
- submission pages
- leaderboard helpers
- voting server flow

## API Enforcement Updated

- Join enforcement now uses the shared resolver via `isChallengeJoinable`.
- Submission enforcement now uses the shared resolver via `isChallengeSubmittable`.
- Voting enforcement continues through `canVoteOnChallenge`, now resolver-backed.

No payment, payout, refund, sponsor money release, paid-entry prize pool, or Prediction Arena settlement behavior was activated.

## Tests Added

Added `scripts/test-challenge-lifecycle.mjs`.

Coverage includes:

- registration opening boundary
- registration closing boundary
- challenge start/end behavior
- submission opening and closing
- voting opening and closing
- livestream scheduled/live/replay states
- winner announcement
- cancelled/paused/completed override behavior
- label/action behavior
- legacy date field fallback
- date normalization and comparison helpers

Existing validation scripts remain in scope:

- `scripts/test-media-upload-validation.mjs`
- `scripts/test-challenge-publish-validation.mjs`

## Remaining P0 Blockers

None identified in this phase.

## Remaining P1 Issues

- Some low-risk prototype/mobile-preview components still display static mock statuses and actions.
- Admin challenge approval/status mutation paths should be audited in a future phase to call the same lifecycle/publish validation before changing public state.
- Full Watch Live access, provider status, stream embed safety, replay visibility, and stream authorization should be completed in Phase 7.7D.
- Long-tail sponsor discovery and dashboard challenge previews should be reviewed for canonical labels after the main public surfaces stabilize.

## Recommended Next Phase

Phase 7.7D should focus on Watch Live and livestream access control: provider configuration, stream URL/embed safety, replay rules, access authorization, and no-secret exposure checks.
