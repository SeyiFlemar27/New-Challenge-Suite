# Challenge Suite Firestore Data Model Contract

This document is the production backend contract for Challenge Suite. The app keeps the current backend architecture: Next.js App Router API routes, Firebase Auth, Firestore, Firebase Storage, and Stripe. No ORM is used.

## Global Rules

- Timestamps are ISO strings unless a route explicitly uses Firestore `Timestamp`. Use `createdAt` and `updatedAt` on mutable documents.
- Server-owned collections must be written only by trusted API routes using Firebase Admin.
- Client reads may be public only for public marketplace data. Private financial, consent, audit, and identity data must be owner/admin only.
- Every write API must derive `userId` from the verified Firebase ID token, never from the request body.
- Status fields must use the enums below. Do not invent new statuses in routes without updating this contract.
- Monetary values should be stored in integer cents where possible. DoroCoin values are integer coin counts.

## Status Enums

```ts
type AppRole = "user" | "creator" | "sponsor";
type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
type ChallengeStatus = "draft" | "pending_review" | "published" | "registration_open" | "active" | "voting" | "completed" | "cancelled" | "rejected";
type RoundStatus = "scheduled" | "active" | "completed" | "cancelled";
type SubmissionStatus = "draft" | "pending_approval" | "approved" | "rejected" | "withdrawn" | "winner";
type VoteMode = "free" | "dorocoin";
type WalletTransactionType = "purchase" | "admin_grant" | "vote_spend" | "boost_spend" | "reward" | "refund" | "adjustment";
type SponsorshipStatus = "pending_review" | "approved" | "rejected" | "active" | "completed" | "cancelled";
type LiveEventStatus = "draft" | "scheduled" | "live" | "ended" | "cancelled";
type NotificationType = "challenge_created" | "challenge_joined" | "submission_uploaded" | "vote_received" | "winner_selected" | "wallet_updated" | "sponsorship_submitted" | "event_registration" | "system";
type ConsentStatus = "accepted" | "revoked" | "superseded";
type WinnerClaimStatus = "pending_review" | "needs_more_info" | "approved" | "rejected" | "paid";
type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
type AdminActionStatus = "queued" | "completed" | "failed";
type AuditSeverity = "info" | "warning" | "critical";
```

## Collections

### `users/{uid}`

Purpose: Private account and authorization record tied to Firebase Auth.

Document ID: Firebase Auth UID.

Example:

```json
{
  "uid": "firebase_uid",
  "email": "creator@example.com",
  "displayName": "Alex Creator",
  "role": "creator",
  "planId": "creator",
  "isAdmin": false,
  "emailVerified": true,
  "verificationStatus": "verified",
  "selfDeclaredRegion": "US",
  "countryCode": "US",
  "stripeCustomerId": "cus_123",
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z",
  "lastLoginAt": "2026-06-18T11:00:00.000Z"
}
```

Required fields: `uid`, `email`, `role`, `planId`, `isAdmin`, `emailVerified`, `verificationStatus`, `createdAt`, `updatedAt`.

Status fields: `verificationStatus`.

Owner/user relationship: `uid` equals Firebase Auth UID.

Role access rules: user reads own record; user may update safe profile/account preferences only; admin/server may update role, plan, verification, and admin flags.

Indexes needed: `role ASC, createdAt DESC`; `verificationStatus ASC, createdAt DESC`; `stripeCustomerId ASC`.

API routes: auth registration service, `lib/server/auth.ts`, Stripe webhook/subscription APIs, admin verification APIs.

### `profiles/{uid}`

Purpose: Public profile data used on challenge, submission, winner, and leaderboard surfaces.

Document ID: Firebase Auth UID.

Example:

```json
{
  "uid": "firebase_uid",
  "displayName": "Alex Creator",
  "firstName": "Alex",
  "lastName": "Creator",
  "initials": "AC",
  "role": "creator",
  "avatarUrl": "https://...",
  "bio": "Challenge host",
  "verified": true,
  "premium": true,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `uid`, `displayName`, `role`, `verified`, `premium`, `createdAt`, `updatedAt`.

Status fields: `verified`.

Owner/user relationship: `uid` equals Firebase Auth UID.

Role access rules: public read; owner may update public profile fields; admin/server controls `verified`, `premium`, and any moderation flags.

Indexes needed: `role ASC, verified ASC`; `displayName ASC`.

API routes: auth registration service, profile APIs, challenge/submission enrichment.

### `challenges/{challengeId}`

Purpose: Challenge marketplace, creator-owned competition configuration, counters, and lifecycle status.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "challenge_id",
  "creatorId": "firebase_uid",
  "title": "Dance Battle",
  "description": "Submit your best routine.",
  "category": "Dance",
  "customCategory": null,
  "type": "public",
  "competitionFormat": "Entry Competition",
  "bestOf": "1 Rounder",
  "status": "published",
  "acceptedSubmissionTypes": ["image", "video"],
  "promoImageUrl": "https://...",
  "trailerVideoUrl": "https://...",
  "entryFeeCents": 0,
  "prizeType": "Bragging Rights (Leaderboard Ranking)",
  "prizePoolCents": 0,
  "registrationDeadline": "2026-07-01T00:00:00.000Z",
  "startsAt": "2026-07-02T00:00:00.000Z",
  "endsAt": "2026-07-10T00:00:00.000Z",
  "votingEndsAt": "2026-07-12T00:00:00.000Z",
  "rules": [{ "id": "rule_1", "label": "Original content", "enabled": true, "editableText": "Submit original content." }],
  "ageRestriction": { "enabled": true, "minimumAge": 18 },
  "timeLimitedUploads": { "enabled": false, "startsAt": null, "endsAt": null },
  "requiresSubmissionApproval": true,
  "participantCount": 0,
  "submissionCount": 0,
  "voteCount": 0,
  "weightedVoteCount": 0,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z",
  "publishedAt": "2026-06-18T10:05:00.000Z"
}
```

Required fields: `id`, `creatorId`, `title`, `description`, `category`, `type`, `competitionFormat`, `bestOf`, `status`, `acceptedSubmissionTypes`, `prizeType`, `participantCount`, `submissionCount`, `voteCount`, `weightedVoteCount`, `createdAt`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: `creatorId` references `users/{uid}`.

Role access rules: public read for published/active challenges; creator reads own drafts; creator/sponsor may create depending role policy; admin approves, rejects, cancels, or force-updates.

Indexes needed: `status ASC, createdAt DESC`; `creatorId ASC, createdAt DESC`; `category ASC, status ASC, createdAt DESC`; `status ASC, startsAt ASC`; `status ASC, endsAt ASC`.

API routes: `GET /api/challenges`, `POST /api/challenges`, `POST /api/challenges/[id]/join`, `POST /api/submissions`, `POST /api/votes`, `POST /api/challenges/[id]/boost`, `POST /api/challenges/[id]/sponsorships`.

### `challengeRounds/{roundId}`

Purpose: Round/bracket state for tournaments and multi-step competitions.

Document ID: generated ID or `{challengeId}_{roundNumber}`.

Example:

```json
{
  "id": "challenge_id_round_1",
  "challengeId": "challenge_id",
  "roundNumber": 1,
  "name": "Qualifier",
  "format": "Entry Competition",
  "status": "active",
  "startsAt": "2026-07-02T00:00:00.000Z",
  "endsAt": "2026-07-05T00:00:00.000Z",
  "submissionIds": ["submission_1"],
  "winnerSubmissionIds": [],
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `challengeId`, `roundNumber`, `name`, `format`, `status`, `startsAt`, `endsAt`, `createdAt`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: belongs to `challenges/{challengeId}`.

Role access rules: public read when parent challenge is public; creator/admin writes; system may update winners.

Indexes needed: `challengeId ASC, roundNumber ASC`; `challengeId ASC, status ASC`.

API routes: future challenge round/bracket APIs; winner selection APIs.

### `submissions/{submissionId}`

Purpose: Participant media entries for challenges.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "submission_id",
  "challengeId": "challenge_id",
  "roundId": "challenge_id_round_1",
  "userId": "firebase_uid",
  "title": "My Entry",
  "description": "Entry description",
  "caption": "Short caption",
  "mediaUrl": "https://...",
  "mediaPath": "submissions/firebase_uid/submission_id/video.mp4",
  "mediaType": "video",
  "status": "pending_approval",
  "rejectionReason": null,
  "voteCount": 0,
  "weightedVoteCount": 0,
  "isWinner": false,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z",
  "approvedAt": null
}
```

Required fields: `id`, `challengeId`, `userId`, `title`, `mediaUrl`, `mediaType`, `status`, `voteCount`, `weightedVoteCount`, `createdAt`, `updatedAt`.

Status fields: `status`, `isWinner`.

Owner/user relationship: `userId` references entrant.

Role access rules: public read for approved entries; owner reads own pending/rejected; creator/admin approves or rejects; server updates counters.

Indexes needed: `challengeId ASC, status ASC, createdAt DESC`; `userId ASC, createdAt DESC`; `challengeId ASC, weightedVoteCount DESC`; `status ASC, createdAt DESC`.

API routes: `POST /api/submissions`, `POST /api/votes`, winner APIs, admin moderation APIs.

### `votes/{voteId}`

Purpose: Immutable vote records and free/dorocoin voting audit trail.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "vote_id",
  "userId": "firebase_uid",
  "challengeId": "challenge_id",
  "submissionId": "submission_id",
  "voteMode": "dorocoin",
  "voteDate": "2026-06-18",
  "weight": 1.25,
  "walletTransactionId": "wallet_txn_id",
  "ipAddressHash": "hash",
  "createdAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `userId`, `challengeId`, `submissionId`, `voteMode`, `voteDate`, `weight`, `createdAt`.

Status fields: none; votes are immutable. Reversal requires an admin/audit action.

Owner/user relationship: `userId` references voter.

Role access rules: signed-in users may read limited vote aggregate data; owner/admin may read full vote record; server-only writes.

Indexes needed: `userId ASC, challengeId ASC, voteDate ASC, voteMode ASC`; `challengeId ASC, submissionId ASC`; `challengeId ASC, createdAt DESC`; `userId ASC, createdAt DESC`.

API routes: `POST /api/votes`, fraud detection APIs.

### `wallets/{userId}`

Purpose: Canonical DoroCoin wallet state.

Document ID: Firebase Auth UID.

Example:

```json
{
  "userId": "firebase_uid",
  "balance": 100,
  "lockedBalance": 0,
  "lifetimePurchased": 500,
  "lifetimeSpent": 400,
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `userId`, `balance`, `lockedBalance`, `updatedAt`.

Status fields: none.

Owner/user relationship: `userId` references wallet owner.

Role access rules: owner read; admin read; server-only writes.

Indexes needed: none beyond document ID.

API routes: `GET/POST /api/dorocoin/transactions`, `POST /api/votes`, `POST /api/challenges/[id]/boost`, Stripe webhook.

### `walletTransactions/{transactionId}`

Purpose: Immutable DoroCoin ledger. Every wallet balance change must have one transaction.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "wallet_txn_id",
  "userId": "firebase_uid",
  "amount": -1,
  "balanceAfter": 99,
  "type": "vote_spend",
  "description": "Vote on submission submission_id",
  "sourceId": "submission_id",
  "stripeSessionId": null,
  "createdBy": "firebase_uid",
  "createdAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `userId`, `amount`, `balanceAfter`, `type`, `description`, `createdBy`, `createdAt`.

Status fields: none; immutable.

Owner/user relationship: `userId` references wallet owner.

Role access rules: owner read; admin read; server-only writes.

Indexes needed: `userId ASC, createdAt DESC`; `type ASC, createdAt DESC`; `sourceId ASC`.

API routes: `GET/POST /api/dorocoin/transactions`, `POST /api/votes`, Stripe webhook, admin grant APIs.

### `doroCoinPackages/{packageId}`

Purpose: Admin-configurable DoroCoin package catalog used by Stripe checkout.

Document ID: stable package ID, for example `doro_50`.

Example:

```json
{
  "id": "doro_50",
  "name": "50 DoroCoins",
  "coins": 50,
  "priceCents": 199,
  "currency": "usd",
  "stripePriceId": "price_123",
  "active": true,
  "sortOrder": 10,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `name`, `coins`, `priceCents`, `currency`, `stripePriceId`, `active`, `createdAt`, `updatedAt`.

Status fields: `active`.

Owner/user relationship: platform-owned.

Role access rules: public read active packages; admin/server writes.

Indexes needed: `active ASC, sortOrder ASC`.

API routes: `POST /api/stripe/dorocoin-checkout`, future package admin APIs.

### `sponsorships/{sponsorshipId}`

Purpose: Sponsor proposals and approved sponsorship records for challenges.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "sponsorship_id",
  "challengeId": "challenge_id",
  "userId": "sponsor_uid",
  "sponsorName": "Brand Inc",
  "brandName": "Brand",
  "contactEmail": "sponsor@example.com",
  "amountCents": 50000,
  "prizePoolContributionCents": 25000,
  "message": "We want to sponsor this.",
  "brandingPreference": "Logo on challenge page",
  "status": "pending_review",
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z",
  "reviewedBy": null,
  "reviewedAt": null
}
```

Required fields: `id`, `challengeId`, `userId`, `sponsorName`, `contactEmail`, `amountCents`, `status`, `createdAt`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: `userId` references sponsor; `challengeId` references challenge.

Role access rules: sponsor reads own; creator reads sponsorships for own challenges after submission; admin reads/writes all; server-only writes.

Indexes needed: `userId ASC, createdAt DESC`; `challengeId ASC, status ASC`; `status ASC, createdAt DESC`.

API routes: `POST /api/challenges/[id]/sponsorships`, sponsorship review APIs.

### `liveEvents/{eventId}`

Purpose: Live event catalog and hosting state.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "event_id",
  "hostId": "creator_uid",
  "challengeId": "challenge_id",
  "title": "Final Showcase",
  "description": "Live judging event.",
  "status": "scheduled",
  "startsAt": "2026-07-12T19:00:00.000Z",
  "endsAt": "2026-07-12T21:00:00.000Z",
  "streamUrl": "https://...",
  "recordingConsentRequired": true,
  "capacity": 500,
  "registrationCount": 0,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `hostId`, `title`, `status`, `startsAt`, `recordingConsentRequired`, `registrationCount`, `createdAt`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: `hostId` references creator/sponsor host.

Role access rules: public read scheduled/live events; host/admin writes; hosting requires eligible subscription.

Indexes needed: `status ASC, startsAt ASC`; `hostId ASC, createdAt DESC`; `challengeId ASC, startsAt ASC`.

API routes: live event create/update APIs, `POST /api/events/[id]/registrations`.

### `notifications/{notificationId}`

Purpose: User notification inbox.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "notification_id",
  "userId": "firebase_uid",
  "type": "submission_uploaded",
  "title": "Submission uploaded",
  "body": "Your submission is pending approval.",
  "targetId": "submission_id",
  "targetType": "submission",
  "read": false,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "readAt": null
}
```

Required fields: `id`, `userId`, `type`, `title`, `body`, `read`, `createdAt`.

Status fields: `read`.

Owner/user relationship: `userId` references recipient.

Role access rules: owner read/update read state; server/admin writes.

Indexes needed: `userId ASC, createdAt DESC`; `userId ASC, read ASC, createdAt DESC`.

API routes: `GET /api/notifications`, `POST /api/notifications/enable`, write helpers in challenge/submission/event APIs.

### `consents/{consentId}`

Purpose: Immutable contextual agreement acceptance logs.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "consent_id",
  "userId": "firebase_uid",
  "agreementType": "challenge_entry",
  "agreementVersion": "2026.06.18",
  "status": "accepted",
  "targetId": "challenge_id",
  "ipAddress": "203.0.113.10",
  "deviceInformation": "Mozilla/5.0 ...",
  "region": "US",
  "createdAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `userId`, `agreementType`, `agreementVersion`, `status`, `ipAddress`, `deviceInformation`, `region`, `createdAt`.

Status fields: `status`.

Owner/user relationship: `userId` references accepting user; `targetId` links contextual object when applicable.

Role access rules: owner read; admin read; server-only create; no updates except server supersede/revoke action.

Indexes needed: `userId ASC, agreementType ASC, agreementVersion ASC`; `userId ASC, targetId ASC`; `agreementType ASC, createdAt DESC`.

API routes: `POST /api/compliance/consents`, signup/entry/vote/winner/sponsor/legal APIs.

### `legalVersions/{legalVersionId}`

Purpose: Versioned legal document registry.

Document ID: `{agreementType}_{version}`.

Example:

```json
{
  "id": "master_account_2026.06.18",
  "agreementType": "master_account",
  "version": "2026.06.18",
  "title": "Master Account Agreement",
  "body": "Agreement text...",
  "requiredForRoles": ["user", "creator", "sponsor"],
  "forceReacceptance": true,
  "active": true,
  "publishedAt": "2026-06-18T10:00:00.000Z",
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `agreementType`, `version`, `title`, `body`, `active`, `forceReacceptance`, `createdAt`, `updatedAt`.

Status fields: `active`, `forceReacceptance`.

Owner/user relationship: platform-owned.

Role access rules: public read active versions; admin/server writes; historical versions preserved.

Indexes needed: `agreementType ASC, active ASC`; `agreementType ASC, version DESC`.

API routes: consent APIs, admin legal document APIs.

### `winnerClaims/{claimId}`

Purpose: Prize claim, identity verification, and payout workflow for winners.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "claim_id",
  "userId": "winner_uid",
  "challengeId": "challenge_id",
  "submissionId": "submission_id",
  "status": "pending_review",
  "identityDocumentName": "passport.pdf",
  "identityDocumentPath": "identity/winner_uid/claim_id/passport.pdf",
  "payoutMethod": "stripe",
  "taxAcknowledged": true,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z",
  "reviewedBy": null,
  "reviewedAt": null
}
```

Required fields: `id`, `userId`, `submissionId`, `status`, `identityDocumentName`, `createdAt`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: `userId` references winner.

Role access rules: owner read/create; admin review/update; server-only writes; identity files private.

Indexes needed: `userId ASC, createdAt DESC`; `status ASC, createdAt DESC`; `challengeId ASC, status ASC`.

API routes: `POST /api/winner-claims`, winner review APIs.

### `reports/{reportId}`

Purpose: User/content reports for abuse, fraud, inappropriate media, or rules violations.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "report_id",
  "userId": "reporter_uid",
  "targetType": "submission",
  "targetId": "submission_id",
  "reason": "fraud",
  "details": "Suspicious votes.",
  "status": "open",
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z",
  "resolvedBy": null,
  "resolvedAt": null
}
```

Required fields: `id`, `userId`, `targetType`, `targetId`, `reason`, `status`, `createdAt`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: `userId` references reporter.

Role access rules: reporter reads own; admin reads/writes all; server-only create if moderation automation reports.

Indexes needed: `userId ASC, createdAt DESC`; `status ASC, createdAt DESC`; `targetType ASC, targetId ASC`.

API routes: future report create/review APIs; fraud hooks.

### `adminActions/{actionId}`

Purpose: Admin command log for moderation, wallet grants, approvals, legal changes, and user management.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "action_id",
  "adminId": "admin_uid",
  "actionType": "approve_submission",
  "targetType": "submission",
  "targetId": "submission_id",
  "status": "completed",
  "reason": "Meets rules",
  "metadata": { "previousStatus": "pending_approval", "nextStatus": "approved" },
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `adminId`, `actionType`, `targetType`, `targetId`, `status`, `createdAt`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: `adminId` references admin user.

Role access rules: admin read; server-only write; never public.

Indexes needed: `adminId ASC, createdAt DESC`; `targetType ASC, targetId ASC`; `actionType ASC, createdAt DESC`.

API routes: admin moderation/review/grant APIs.

### `auditLogs/{auditLogId}`

Purpose: Immutable security, compliance, fraud, and system event log.

Document ID: generated Firestore ID.

Example:

```json
{
  "id": "audit_log_id",
  "actorId": "firebase_uid",
  "actorRole": "creator",
  "eventType": "vote_cast",
  "severity": "info",
  "targetType": "vote",
  "targetId": "vote_id",
  "ipAddress": "203.0.113.10",
  "deviceInformation": "Mozilla/5.0 ...",
  "metadata": { "challengeId": "challenge_id" },
  "createdAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `eventType`, `severity`, `createdAt`.

Status fields: `severity`.

Owner/user relationship: optional `actorId` references user; system events may use `actorId: "system"`.

Role access rules: admin/server only; no client reads or writes.

Indexes needed: `eventType ASC, createdAt DESC`; `actorId ASC, createdAt DESC`; `severity ASC, createdAt DESC`; `targetType ASC, targetId ASC`.

API routes: all write APIs should eventually append audit logs for high-risk actions.

## Current API Route Comparison

The current routes are a good start, but several fields and collection names are inconsistent with the production contract.

### Collection Name Mismatches

- Current wallet collection is `doroCoinWallets`; contract uses canonical `wallets`.
- Current wallet ledger collection is `doroCoinTransactions`; contract uses canonical `walletTransactions`.
- Current consent collection is `userConsents`; contract uses canonical `consents`.
- Current legal rules reference `legalDocumentVersions`; contract uses canonical `legalVersions`.
- Current event registration collection is `eventRegistrations`; the required list includes `liveEvents`, but registrations should be documented later as a supporting collection.
- Current boost records use `boosts`; boosts are not in the required list and should either be documented as supporting collection or folded into challenge promotion records.
- Current subscription webhook writes `subscriptionEvents`; this should be represented in `auditLogs`, `adminActions`, or a future `subscriptions` collection.

### Route Field Gaps

`POST /api/challenges`

- Writes `entryFee` and `prizePool` as numbers; contract expects `entryFeeCents` and `prizePoolCents`.
- Does not persist `competitionFormat`, `bestOf`, `customCategory`, `promoImageUrl`, `trailerVideoUrl`, `ageRestriction`, `timeLimitedUploads`, `sponsorshipAllocation`, or `publishedAt`.
- Uses status `published` or `draft`; no `pending_review` path yet.
- Does not create initial `challengeRounds`.

`GET /api/challenges`

- Reads all challenges ordered by `createdAt`; should filter public statuses for non-admin users once auth-aware listing is added.

`POST /api/challenges/[id]/join`

- Writes `challengeParticipants`, which is useful but not included in the required contract list.
- Does not validate entry agreement consent, registration deadline fee/payment state, or age restriction.

`POST /api/submissions`

- Requires `mediaUrl` but does not require or store `mediaPath`.
- Does not validate challenge accepted media types.
- Does not verify participant enrollment.
- Does not attach `roundId`.
- Does not check upload window or challenge status before incrementing `submissionCount`.

`POST /api/votes`

- Correctly creates `votes` and updates counters.
- Uses `doroCoinWallets` and `doroCoinTransactions` instead of canonical `wallets` and `walletTransactions`.
- Does not store `walletTransactionId` on paid vote records.
- Does not store fraud metadata such as IP hash or device fingerprint.
- Error handling for transaction business-rule failures should return structured `400/409` responses instead of generic server errors.

`GET/POST /api/dorocoin/transactions`

- Uses old collection names.
- Does not read `doroCoinPackages` from Firestore; packages are currently code constants.
- Admin grant route exists through transaction type, but should also create `adminActions` and `auditLogs`.

`POST /api/stripe/dorocoin-checkout`

- Uses code/env package lookup; contract expects package records in `doroCoinPackages`.
- Should include package ID, coin count, and user ID metadata and verify package active state from Firestore.

`POST /api/stripe/webhook`

- Credits wallets and records subscription events.
- Should use canonical wallet collections.
- Should write idempotency records keyed by Stripe event/session ID.
- Should create `auditLogs` for wallet credits and subscription changes.

`POST /api/challenges/[id]/boost`

- Uses `boosts`, which is outside the required contract list.
- Uses mock package data from `lib/flow-data.ts`.
- Should either get a contract collection for boosts or move promotion data under challenges.

`POST /api/challenges/[id]/sponsorships`

- Writes `amount` and `prizePoolContribution` as numbers; contract expects cents fields.
- Does not set `updatedAt`.
- Does not enforce sponsor role.
- Does not write sponsor consent checks, `adminActions`, or `auditLogs`.

`POST /api/events/[id]/registrations`

- Writes registrations but there is no `liveEvents` create/read/update route yet.
- Does not verify the live event exists, is open, or has capacity.
- Does not verify event agreement consent.

`GET /api/notifications`

- Uses expected collection.
- Notification documents currently lack `targetType` and `readAt`.
- No API exists yet to mark notifications read.

`POST /api/notifications/enable`

- Writes `notificationPreferences`, a supporting collection not in the required list.
- This is acceptable as a supporting collection, but it should be added to security/index docs.

`POST /api/compliance/consents`

- Uses `userConsents`; contract expects `consents`.
- Uses `timestamp`; contract expects `createdAt`.
- Does not write `id` into document body.
- Does not verify legal version from Firestore `legalVersions`; it uses local `lib/legal.ts`.

`POST /api/winner-claims`

- Writes `winnerClaims`, but does not store generated `id`.
- Does not store `challengeId`, `updatedAt`, `identityDocumentPath`, payout/tax acknowledgement fields, or review fields.
- Does not upload the identity document to Firebase Storage yet.
- Does not verify the claimant is the actual winner.

### Missing API Coverage

- `challengeRounds` create/update/read APIs.
- `doroCoinPackages` admin/read APIs.
- `liveEvents` create/update/read APIs.
- `reports` create/review APIs.
- `adminActions` write/read APIs.
- `auditLogs` append/query helpers.
- `legalVersions` admin/read APIs.
- Submission approval/rejection APIs.
- Winner selection APIs.
- Notification mark-as-read API.

## Required Index Additions

Current indexes cover free-vote enforcement, notifications by user, and old DoroCoin transactions by user. Add indexes for the canonical contract before production data migration:

```json
[
  { "collectionGroup": "challenges", "fields": ["status ASC", "createdAt DESC"] },
  { "collectionGroup": "challenges", "fields": ["creatorId ASC", "createdAt DESC"] },
  { "collectionGroup": "challenges", "fields": ["category ASC", "status ASC", "createdAt DESC"] },
  { "collectionGroup": "challengeRounds", "fields": ["challengeId ASC", "roundNumber ASC"] },
  { "collectionGroup": "submissions", "fields": ["challengeId ASC", "status ASC", "createdAt DESC"] },
  { "collectionGroup": "submissions", "fields": ["challengeId ASC", "weightedVoteCount DESC"] },
  { "collectionGroup": "votes", "fields": ["userId ASC", "challengeId ASC", "voteDate ASC", "voteMode ASC"] },
  { "collectionGroup": "walletTransactions", "fields": ["userId ASC", "createdAt DESC"] },
  { "collectionGroup": "sponsorships", "fields": ["challengeId ASC", "status ASC"] },
  { "collectionGroup": "liveEvents", "fields": ["status ASC", "startsAt ASC"] },
  { "collectionGroup": "consents", "fields": ["userId ASC", "agreementType ASC", "agreementVersion ASC"] },
  { "collectionGroup": "winnerClaims", "fields": ["status ASC", "createdAt DESC"] },
  { "collectionGroup": "reports", "fields": ["status ASC", "createdAt DESC"] },
  { "collectionGroup": "adminActions", "fields": ["targetType ASC", "targetId ASC"] },
  { "collectionGroup": "auditLogs", "fields": ["eventType ASC", "createdAt DESC"] }
]
```

## Security Expectations Summary

- Public read: published challenges, approved submissions, active DoroCoin packages, active legal versions, public profiles, public live events.
- Owner read: users, wallets, wallet transactions, consents, winner claims, notifications, reports, private submissions.
- Creator read: own challenges and child moderation queues.
- Sponsor read: own sponsorships and approved challenge sponsorship visibility.
- Admin read/write: moderation, legal versions, package catalog, reports, admin actions, winner claims.
- Server-only write: votes, wallet balances, wallet transactions, counters, audit logs, admin actions, notifications, financial events.

## Next Backend Implementation Order

1. Decide whether to migrate current collection names to canonical names now or document aliases temporarily.
2. Update Firestore rules and indexes to match the chosen collection names.
3. Add shared TypeScript document types and Zod validators for each write route.
4. Update existing APIs to write required fields and reject missing/inconsistent data.
5. Add missing APIs for rounds, packages, legal versions, reports, audit logs, live events, moderation, and notification read state.
