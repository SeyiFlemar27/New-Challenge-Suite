# Phase 7.4E: Media, Participants, Prediction, Rewards, Ads, and Revenue Flow

## Scope

Phase 7.4E focuses on product-flow polish without activating unsafe money movement. The work adds upload-first media controls, public-safe participant visibility, challenge-level Prediction Arena placement, tiered DoroCoin purchase rewards, ad-vote foundations, and clearer revenue-share visibility.

## Media Upload System

Normal user-facing media fields now use upload controls instead of asking users to paste image or media URLs:

- Challenge cover and challenge promotional media
- Host event/tournament media and branding media
- Challenge entry submission media
- Sponsor logo and banner media
- Profile avatar and cover media

The reusable upload component validates file type and size, shows previews, supports remove/replace, reports progress with resumable Firebase Storage uploads, and fails closed with a clear message if Storage is not available or rules are not published.

## Storage Paths And Rules

Local `storage.rules` now define narrow authenticated paths:

- `challengeMedia/{challengeId}/{uid}/{fileId}`
- `challengeMedia/drafts/{uid}/{folder}/{fileId}`
- `challengeMedia/host-drafts/{uid}/{folder}/{fileId}`
- `submissions/{challengeId}/{uid}/{fileId}`
- `sponsorMedia/profile/{uid}/{folder}/{fileId}`
- `profileMedia/{uid}/{fileId}`
- `rewardPrizeMedia/{prizeId}/{uid}/{fileId}`
- `eventMedia/{eventId}/{uid}/{fileId}`
- `eventMedia/host-drafts/{uid}/{folder}/{fileId}`

Images are limited to JPG, PNG, and WebP. Videos are limited to MP4, WebM, and QuickTime. The bucket is not public. Submission media remains owner/admin readable until an approved public-delivery flow is intentionally opened.

Do not publish Storage rules until upload QA confirms the intended production state.

## Challenge Submission Upload Flow

The join/submission page uses a challenge-scoped Storage path, validates image/video type and file size, previews the selected file, shows upload progress, and refuses to create a submission if upload fails. Submission status still follows the existing review lifecycle.

## Sponsor Logo/Banner Upload Flow

Sponsor onboarding now uses upload controls for logo and banner media. Uploaded URLs are stored in the existing sponsor profile fields so existing rendering and validation remain compatible. Website and CTA URLs remain URL fields because they are external links, not media uploads.

## Participants Directory

Challenge detail responses now include public-safe participants from `challengeParticipants`. Public views only expose display name, username/handle when available, avatar URL, participant status, entry status, and profile path. Emails, private user IDs, KYC, wallet data, risk flags, and moderation/internal notes are not returned.

The challenge detail page now shows a searchable/load-more Participants section. Private challenge detail access remains gated by the existing private invite/access logic before participants are returned.

## Prediction Arena Placement And Flow

Challenge detail pages now include a Prediction Arena card near the engagement/voting area. The challenge-specific Prediction Arena page loads eligible participants, lets the user select a predicted winner, shows the 7% DoroCoin platform fee and net pool, and requires rule acknowledgement.

Server-side Prediction Arena protection rejects missing challenges, private/exclusive challenges without a dedicated access review, started challenges, invalid participants, and ineligible participant statuses. Stakes remain DoroCoin-only, lock DoroCoins, and settlement remains admin-review only.

No public UI calls the feature betting.

## DoroCoin Purchase Points And Reward Tiers

Reward tiers are now based on server-confirmed DoroCoin purchase points:

- Basic: 100 points = 1 Basic spin
- Standard: 250 points = 1 Standard spin
- Premium: 500 points = 1 Premium spin

Points are awarded only from the Stripe webhook after DoroCoin purchase fulfillment succeeds. DoroCoin vote spending no longer grants reward points. Tiered spin credits are tracked separately from total points.

## Prize Wheel

The Doro Rewards Wheel page lets users choose Basic, Standard, or Premium wheels when they have that tier's spin credits. Spin records are created as manual/admin-fulfillment foundations. No cash-out prizes are enabled by default, and high-value/manual prizes remain pending admin fulfillment.

Admin prize-wheel management remains a foundation through the admin operations center. Prize creation, inventory, weight/probability, uploaded prize media, fulfillment, and cancellation should remain admin-only and audit-logged before production activation.

## Ads For Votes

`/api/ad-votes` is an authenticated foundation endpoint. When no verified ad provider is configured, it records a blocked foundation log and returns `AD_PROVIDER_NOT_CONFIGURED`. It does not grant votes, DoroCoins, or ad credits from a client-only button.

Future activation requires a verified provider callback, daily limits, cooldowns, anti-abuse checks, reward tokens, and audit/reward logs.

## Revenue Sharing Visibility

Challenge detail pages now link to the revenue-share explanation. Copy reinforces:

- Generated revenue split: 65% winners, 15% host, 10% sponsor, 10% platform
- Initial prize/sponsor prize money remains separate and 100% winner-directed after review
- Challenger vote-revenue bonus remains separate and admin-review only
- No payout, sponsor release, or prize release is automatic

## Firestore/API Protection

Local Firestore rules continue to deny direct client writes to sensitive collections and now include ad-vote reward logs. Sensitive writes for predictions, rewards, ad-vote logs, DoroCoin balances, ledgers, KYC metadata, and revenue records remain server/admin controlled.

Normal users must not be able to self-grant ad credits, DoroCoin purchase points, spin credits, prize fulfillment, revenue ledgers, prediction settlement, or media in another user's path.

## Remaining Risks

- Storage rules need dedicated staging upload QA before manual publication.
- Public media delivery for approved submission media needs a signed/public delivery design if private Storage reads remain preferred.
- Admin prize-wheel creation/editing can be expanded into a richer form after the foundation is QA-tested.
- Ad rewards require a real provider integration and verified callback before any vote credit can be granted.

## QA Checklist

- Upload challenge cover media as a Free user and confirm fail-closed messaging if Storage is unpublished.
- Upload paid Creator/Host challenge media and confirm preview/progress/remove/replace.
- Upload sponsor logo/banner and save sponsor profile.
- Upload profile avatar/banner and save settings.
- Submit image and video entries; verify failed upload does not create broken submission.
- Confirm public challenge detail shows approved/active participants only.
- Confirm private challenge participants are not exposed without private access.
- Enter Prediction Arena from challenge detail and verify participant selector, 7% fee, and DoroCoin-only copy.
- Confirm started/private/ineligible prediction attempts fail server-side.
- Buy DoroCoins through Stripe test mode and confirm points/spin credits are awarded only by webhook.
- Confirm DoroCoin vote spending does not award reward points.
- Spin each reward tier only when tier credit exists.
- Confirm ad-vote endpoint never grants a vote without provider verification.
- Confirm revenue-share copy remains review-only and no payout/release is activated.
