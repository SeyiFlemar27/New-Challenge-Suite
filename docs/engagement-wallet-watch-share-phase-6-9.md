# Phase 6.9 Engagement, Wallet, Watch, And Share

## Account Creation Rules

- Free Competitors cannot create challenges and receive the Become a Creator gate.
- Creator Starter accounts can create one basic public, non-monetized challenge each month.
- Paid Creator accounts use the Creator wizard and its plan limits.
- Paid Host accounts use the Host competition builder.

## Engagement

Saved, Watch Later, and Interested states are stored per authenticated user in `challengeEngagements`. The Favorites page reads those records and separates them into Saved Challenges, Watch Later, and Interested Events. Users can remove an item without losing unrelated engagement preferences.

Interested counts are updated transactionally only when a user's interested state changes. Reminder preferences support one hour, 30 minutes, five minutes, and the live start time. They are stored in-app; push and email delivery are not represented as active.

The Watch Room provides real challenge status, timing, submissions, voting links, reminder state, sharing, and leaderboard navigation. When no stream exists it says so explicitly.

## Sharing

Challenge sharing uses the Web Share API when available. The fallback supports Copy Link, WhatsApp, X, Facebook, LinkedIn, and email with encoded canonical URLs.

## Wallet And Voting

Core DoroCoin wallet loading is independent from optional review-only financial queries. A missing optional index no longer turns a valid zero-balance wallet into a hard failure. Missing wallets continue to initialize safely at zero through the existing server helper.

Free daily votes and DoroCoin votes use the existing server voting route. DoroCoin debit and vote creation remain atomic. Client requests include an idempotency key to prevent duplicate spending when requests are retried.

Ad rewards remain a disabled foundation. No ad is served and no vote or DoroCoin is granted without a future verified provider callback, limits, and abuse controls.

## Plan State And Checkout

Sidebar and dashboard surfaces render a neutral workspace loading state until trusted account and subscription data is available. Paid Creator and Host users are not initially rendered as Free Competitors.

The checkout success page polls webhook-backed account state and presents a premium verification timeline. It remains informational and cannot activate subscriptions or credit DoroCoins.

## Creator Studio

Creator Studio prioritizes creator challenges, submissions, analytics, sponsor readiness, boosts, and review-only earnings foundations. Discovery remains available lower in the page because Creator users retain normal competitor participation.

## Safety

This phase does not activate payouts, withdrawals, refunds, sponsor releases, prize-pool releases, KYC, DoroCoin-to-cash conversion, automatic winner payments, or unverified ad rewards. Stripe webhook and DoroCoin checkout fulfillment are unchanged.

## QA Checklist

1. Save and unsave a challenge; refresh and confirm persistence.
2. Add and remove Watch Later and Interested states.
3. Save each reminder option and confirm the Watch Room reflects it.
4. Test native sharing and every fallback URL.
5. Open a new account wallet and confirm a zero balance instead of a hard failure.
6. Record a free vote, then confirm the daily limit message.
7. Record a DoroCoin vote and confirm one wallet transaction and one vote result.
8. Confirm the ad action is disabled and grants nothing.
9. Load paid Creator and Host workspaces and confirm no Free UI flash.
10. Confirm checkout success waits for webhook-backed subscription state.
