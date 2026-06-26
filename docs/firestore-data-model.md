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
type ChallengeStatus = "draft" | "pending_review" | "scheduled" | "active" | "submission_open" | "voting_open" | "voting_closed" | "under_review" | "winners_announced" | "completed" | "cancelled" | "paused";
type RoundStatus = "scheduled" | "active" | "completed" | "cancelled";
type SubmissionStatus = "draft" | "submitted" | "pending_review" | "approved" | "rejected" | "flagged" | "active" | "eliminated" | "winner" | "disqualified" | "withdrawn";
type VoteMode = "free" | "dorocoin";
type WalletTransactionType = "purchase" | "admin_grant" | "vote_spend" | "boost_spend" | "reward" | "adjustment";
type SponsorshipStatus = "pending_review" | "approved" | "rejected" | "active" | "completed" | "cancelled";
type LiveEventStatus = "draft" | "scheduled" | "live" | "ended" | "cancelled";
type NotificationType = "challenge_created" | "challenge_joined" | "submission_uploaded" | "vote_received" | "winner_selected" | "wallet_updated" | "sponsorship_submitted" | "event_registration" | "system";
type ConsentStatus = "accepted" | "revoked" | "superseded";
type WinnerClaimStatus = "pending_review" | "needs_more_info" | "approved" | "rejected" | "payout_pending" | "payout_processing" | "paid" | "failed_payout";
type CashWalletStatus = "inactive" | "review_only" | "locked";
type CashTransactionType = "prize_placeholder_created" | "sponsor_contribution_requested" | "payout_review_created" | "refund_review_created" | "dispute_opened" | "manual_adjustment_placeholder" | "voided_placeholder";
type CashTransactionStatus = "pending_review" | "recorded" | "voided" | "blocked";
type PrizePoolStatus = "disabled" | "pending_review" | "sponsor_funded_pending" | "locked" | "cancelled";
type PayoutStatus = "pending_review" | "needs_info" | "approved_placeholder" | "blocked" | "cancelled";
type RefundStatus = "requested" | "pending_review" | "approved_placeholder" | "rejected" | "cancelled";
type DisputeStatus = "open" | "reviewing" | "resolved" | "dismissed";
type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
type AdminActionStatus = "queued" | "completed" | "failed";
type AuditSeverity = "info" | "warning" | "critical";
```

Legacy read aliases only: older Firestore/demo records may still contain challenge statuses `published`, `registration_open`, or `voting`; submission status `pending_approval`; participant status `joined`; or winner compatibility fields such as `isWinner`/`confirmed`. New application writes should use the canonical statuses above and map legacy values through `lib/challenge-status.ts`.

Money-sensitive systems are intentionally locked for the current production foundation: paid-entry prize pools, prize pool release, real cash payouts, automatic refunds, sponsor money release, and KYC document processing are not active. Store review/status foundations only until those systems are intentionally enabled.

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
  "status": "pending_review",
  "acceptedSubmissionTypes": ["image", "video"],
  "promoImageUrl": "https://...",
  "trailerVideoUrl": "https://...",
  "entryFeeCents": 0,
  "paidEntryEnabled": false,
  "prizeType": "Bragging Rights (Leaderboard Ranking)",
  "prizePoolCents": 0,
  "prizePoolEnabled": false,
  "cashPayoutsEnabled": false,
  "payoutStatus": "not_applicable",
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
  "submittedForReviewAt": "2026-06-18T10:05:00.000Z"
}
```

Required fields: `id`, `creatorId`, `title`, `description`, `category`, `type`, `competitionFormat`, `bestOf`, `status`, `acceptedSubmissionTypes`, `prizeType`, `participantCount`, `submissionCount`, `voteCount`, `weightedVoteCount`, `createdAt`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: `creatorId` references `users/{uid}`.

Role access rules: public read for public scheduled/active/submission_open/voting_open/completed challenges; creator reads own drafts; sponsor accounts use sponsor routes rather than normal challenge creation; admin-review foundations approve, reject, cancel, or force-update later.

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
  "status": "pending_review",
  "rejectionReason": null,
  "voteCount": 0,
  "weightedVoteCount": 0,
  "winnerStatus": null,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z",
  "approvedAt": null
}
```

Required fields: `id`, `challengeId`, `userId`, `title`, `mediaUrl`, `mediaType`, `status`, `voteCount`, `weightedVoteCount`, `createdAt`, `updatedAt`.

Status fields: `status`, `winnerStatus`. `isWinner` remains legacy read compatibility only.

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

Purpose: Canonical DoroCoin wallet state. DoroCoin is an internal platform credit for votes, boosts, and future promotional features. DoroCoin is not cash, is not withdrawable, and cannot be converted into payout balance.

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

Purpose: Immutable DoroCoin ledger. Every DoroCoin wallet balance change must have one transaction. This ledger must never record real cash payouts, withdrawals, or sponsor money release.

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
### `cashWallets/{userId}`

Purpose: Read-only cash/payout foundation for future prize winnings, creator/host earnings, refunds, and payout review states. This is separate from DoroCoin and is not withdrawable in the current product phase.

Example:

```json
{
  "userId": "firebase_uid",
  "status": "review_only",
  "availableBalanceCents": 0,
  "pendingBalanceCents": 0,
  "lockedBalanceCents": 0,
  "currency": "USD",
  "withdrawalsEnabled": false,
  "payoutProviderConnected": false,
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `userId`, `status`, `availableBalanceCents`, `pendingBalanceCents`, `lockedBalanceCents`, `currency`, `withdrawalsEnabled`, `payoutProviderConnected`, `updatedAt`.

Status fields: `status`.

Owner/user relationship: `userId` references wallet owner.

Role access rules: owner reads own foundation; server/admin-review writes only. No client-side cash balance mutation.

Indexes needed: none for direct document reads; future `cashTransactions` queries need `userId ASC, createdAt DESC`.

API routes: `GET /api/wallet` returns foundation state only.

### `cashTransactions/{transactionId}`

Purpose: Immutable cash ledger foundation for review-only financial events. These records document placeholder events for prize foundations, sponsor contribution requests, payout reviews, refund reviews, disputes, and manual review adjustments. They do not represent settled cash, do not increase wallet balances, do not increase withdrawable balances, do not trigger payouts, do not trigger refunds, and do not release sponsor funds.

Example:

```json
{
  "id": "cash_txn_id",
  "userId": "firebase_uid",
  "walletId": "firebase_uid",
  "type": "payout_review_created",
  "status": "pending_review",
  "amountCents": 0,
  "currency": "USD",
  "direction": "none",
  "sourceType": "winner_claim",
  "sourceId": "claim_id",
  "challengeId": "challenge_id",
  "submissionId": "submission_id",
  "winnerClaimId": "claim_id",
  "payoutId": "payout_id",
  "refundId": null,
  "disputeId": null,
  "description": "Payout review placeholder created.",
  "balanceImpact": "none",
  "withdrawableImpact": "none",
  "providerConnected": false,
  "transferEnabled": false,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

Required fields: `id`, `userId`, `walletId`, `type`, `status`, `amountCents`, `currency`, `direction`, `sourceType`, `sourceId`, `description`, `balanceImpact`, `withdrawableImpact`, `providerConnected`, `transferEnabled`, `createdAt`, `updatedAt`.

Optional link fields: `challengeId`, `submissionId`, `winnerClaimId`, `payoutId`, `refundId`, `disputeId`.

Status fields: `status` (`pending_review`, `recorded`, `voided`, `blocked`).

Allowed types: `prize_placeholder_created`, `sponsor_contribution_requested`, `payout_review_created`, `refund_review_created`, `dispute_opened`, `manual_adjustment_placeholder`, `voided_placeholder`.

Safety requirements: every record must force `balanceImpact: "none"`, `withdrawableImpact: "none"`, `providerConnected: false`, and `transferEnabled: false`.

Role access rules: owner reads own in future owner views; server/admin-review writes only. Do not create payout transfers, refund transfers, sponsor releases, cash withdrawals, or balance mutations from these records in this phase.

Indexes needed: none in the current batch because no route queries this collection. Future owner/admin views may need `userId ASC, createdAt DESC` and `status ASC, createdAt DESC`.

### `prizePools/{challengeId}`

Purpose: Prize pool foundation for challenge-level review states. Paid-entry prize pools, sponsor funding release, and prize release are disabled.

Required fields: `challengeId`, `status`, `releaseStatus`, `fundingStatus`, `paidEntryEnabled`, `cashPayoutsEnabled`, `transferEnabled`, `sponsorFundingReleaseEnabled`, `prizeReleaseEnabled`, `amountCents`, `totalCommittedCents`, `totalReleasedCents`, `currency`, `sourceType`, `sourceId`, `createdAt`, `updatedAt`.

Status fields: `status` (`disabled`, `pending_review`, `sponsor_funded_pending`, `locked`, `cancelled`).

Role access rules: public may read safe display fields for public challenges; server/admin-review writes only.

Indexes needed: `status ASC, updatedAt DESC` if review queues are introduced later.

### `payouts/{payoutId}`

Purpose: Payout review/status foundation. Payout provider integration and transfers are not connected.

Required fields: `id`, `userId`, `challengeId`, `submissionId`, `winnerClaimId`, `sourceType`, `sourceId`, `status`, `reviewStatus`, `releaseStatus`, `amountCents`, `currency`, `payoutProviderConnected`, `transferEnabled`, `createdAt`, `updatedAt`.

Status fields: `status` (`pending_review`, `needs_info`, `approved_placeholder`, `blocked`, `cancelled`).

Role access rules: owner reads own; server/admin-review writes only. No payout execution route should exist in this phase.

Indexes needed: `userId ASC, createdAt DESC`; `status ASC, createdAt DESC`.

### `refunds/{refundId}` and `disputes/{disputeId}`

Purpose: Status foundations for future refund and dispute review. Automatic refunds are not active.

Refund statuses: `requested`, `pending_review`, `approved_placeholder`, `rejected`, `cancelled`.

Dispute statuses: `open`, `reviewing`, `resolved`, `dismissed`.

Role access rules: owner reads own; server/admin-review writes only. No automatic refund or money release behavior is active.

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

Purpose: Prize claim and review foundation for winners. Identity verification and payout processing are not active yet.

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
  "payoutStatus": "pending_review",
  "taxAcknowledged": true,
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z",
  "reviewedBy": null,
  "reviewedAt": null
}
```

Required fields: `id`, `userId`, `submissionId`, `challengeId`, `status`, `reviewStatus`, `payoutId`, `payoutStatus`, `payoutProviderConnected`, `transferEnabled`, `identityDocumentName`, `identityDocumentStorageStatus`, `kycProcessingStatus`, `createdAt`, `updatedAt`.

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
  "metadata": { "previousStatus": "pending_review", "nextStatus": "approved" },
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

- Paid-entry and prize-pool release are locked. New challenge writes force `entryFee`, `entryFeeCents`, `prizePool`, and `prizePoolCents` to zero and create a disabled `prizePools/{challengeId}` foundation record.
- Does not persist `competitionFormat`, `bestOf`, `customCategory`, `promoImageUrl`, `trailerVideoUrl`, `ageRestriction`, `timeLimitedUploads`, `sponsorshipAllocation`, or `publishedAt`.
- New writes should use `draft` or `pending_review`; `published` remains a legacy read alias only.
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
- Does not store `walletTransactionId` on DoroCoin vote records yet.
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

- Credits DoroCoin wallets and records subscription events.
- DoroCoin credits use `doroCoinWallets`/`doroCoinTransactions`; cash wallet foundations remain separate in `cashWallets`/`cashTransactions`.
- Writes idempotency records in `stripeWebhookEvents` keyed by Stripe event ID before processing DoroCoin credits.
- Should create `auditLogs` for wallet credits and subscription changes.

`POST /api/challenges/[id]/boost`

- Uses `boosts`, which is outside the required contract list.
- Uses mock package data from `lib/flow-data.ts`.
- Should either get a contract collection for boosts or move promotion data under challenges.

`POST /api/challenges/[id]/sponsorships`

- Writes sponsor proposal amounts for review only, including cents-compatible fields. Sponsor funding/release is not active yet. If a sponsor contribution intent is present, a `prizePools/{challengeId}` placeholder is merged as review-only.
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

- Writes generated `id`, `challengeId`, `reviewStatus`, `payoutId`, `payoutStatus`, `updatedAt`, and review-only identity metadata. Also writes a matching `payouts/{payoutId}` placeholder with transfers disabled.
- KYC document processing and real payout workflow remain inactive.
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
  { "collectionGroup": "cashTransactions", "fields": ["userId ASC", "createdAt DESC"] },
  { "collectionGroup": "payouts", "fields": ["status ASC", "createdAt DESC"] },
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

- Public read: public scheduled/active/submission_open/voting_open/completed challenges, approved/active/winner submissions, active DoroCoin packages, active legal versions, public profiles, public live events. Legacy `published` challenge records are readable through compatibility helpers only.
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





## Phase 3.2 Prize/Payout Review Foundations

Batch 3.2 adds foundation-only writes for money-adjacent review records. These records are intentionally not money movement records.

- `POST /api/challenges` creates `prizePools/{challengeId}` with `status: "disabled"`, `releaseStatus: "not_active"`, `fundingStatus: "not_active"`, `amountCents: 0`, all release/transfer flags false, and `sourceType: "challenge"`. It also writes a `cashTransactions` record with `type: "prize_placeholder_created"`, `amountCents: 0`, and no balance/withdrawable impact.
- `POST /api/challenges/[id]/sponsorships` keeps sponsorships `pending_review`, `fundingReleaseStatus: "not_active"`, and `sponsorMoneyCaptureStatus: "not_active"`. It stores both compatibility number fields and cents fields. If contribution intent is greater than zero, it merges a review-only `prizePools/{challengeId}` placeholder. It also writes a `cashTransactions` record with `type: "sponsor_contribution_requested"` and no capture, hold, release, payout, balance, or withdrawable impact.
- `POST /api/winner-claims` creates a matching `payouts/{payoutId}` placeholder and stores `payoutId` on the claim. The payout placeholder uses `status: "pending_review"`, `reviewStatus: "pending_review"`, `releaseStatus: "not_active"`, `transferEnabled: false`, and `payoutProviderConnected: false`. It also writes a `cashTransactions` record with `type: "payout_review_created"` and no payout approval, payment, balance, or withdrawable impact.
- `refunds` and `disputes` currently have helper/data contracts only. No routes, UI, automatic refunds, dispute resolution UI, or admin review UI are active.
- `GET /api/winners` must normalize prize/payout values with `prizeDisplayStatus: "foundation_only"`, `fundingReleaseStatus: "not_active"`, and `cashPayoutsEnabled: false` so old seeded prize fields are not presented as payable funds.

Operational warnings:

- Real cash payouts are inactive.
- Automatic refunds are inactive.
- Sponsor money capture/release is inactive.
- Paid-entry prize pools are inactive.
- KYC document processing is inactive.
- Payout providers are not connected.
- DoroCoin cannot be converted to cash.
- No withdraw button or payout execution route should be exposed.
