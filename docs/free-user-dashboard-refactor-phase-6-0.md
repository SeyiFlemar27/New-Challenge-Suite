# Phase 6.0 Free User Dashboard Refactor

## Free Competitor Experience

Free competitor accounts follow a simple product loop:

`Explore -> Join -> Vote -> Compete -> Track Entries`

Their dashboard contains competition stats, trending/public challenges, entry tracking, leaderboard access, badges, and DoroCoin voting actions. Creator Studio, Host Control Center, sponsorship, revenue, prize-pool management, and admin controls are not rendered.

## Sidebar

Free competitors see:

- Home
- Feed / Explore
- Favorites
- Wallet / DoroCoin
- Challenges
- My Entries
- Leaderboards
- Winners
- Profile
- Settings

Create Challenge, My Challenges, private challenges, host tools, tournament management, live-event management, and sponsor tools are omitted.

Sidebar selection uses a most-specific route resolver. `/challenges/create` resolves to Create Challenge before the broader `/challenges/*` match, so only one navigation item is active.

## Free Creator And Host Exception

Accounts with Creator or Host intent and the Free plan can access a compact basic challenge form. It supports:

- Public visibility
- Title, category, and description
- Standard rules
- Basic cover image URL
- Image or video submission type
- Start, entry, voting, and end dates

The server enforces one basic public challenge per month through existing plan limits. Private, paid-entry, prize-pool, sponsor, tournament, live-event, boost, advanced voting, and promo-media settings are absent from the free form and remain disabled server-side.

## Create Route Protection

Free competitors visiting `/challenges/create` receive a focused access gate with Compare Plans and Back to Challenges actions. The challenge API also rejects free competitor creation requests while preserving free Creator/Host basic creation.

## Challenge Detail

Free competitors retain:

- Watch and reminders
- Join and submit
- Free daily voting and DoroCoin vote access
- Save and Watch Later
- Share
- Comments

Boost, sponsor proposal, sponsor information, and detailed prize-pool management foundations are hidden. The page states that Free users receive one free vote per challenge per day.

## Wallet

The Free competitor wallet contains:

- DoroCoin balance
- Free and DoroCoin voting explanation
- DoroCoin package and custom purchase controls
- Basic DoroCoin transaction history

Creator earnings, sponsor payments, prize-pool management, withdrawal, and payout controls are not rendered for Free competitors.

## QA Checklist

1. Confirm a Free competitor sees only the approved sidebar items.
2. Confirm `/challenges/create` highlights only Create Challenge for eligible creators/hosts.
3. Confirm `/challenges/[id]` highlights only Challenges.
4. Confirm `/my-entries`, Leaderboards, Winners, Profile, Settings, Wallet, and Favorites each highlight only themselves.
5. Confirm the Free dashboard has no creator, host, sponsor, revenue, or admin cards.
6. Confirm Free competitor create links are absent from Dashboard, Challenges, and Feed.
7. Confirm manual create navigation shows the competitor access gate.
8. Confirm a direct Free competitor API creation request is rejected.
9. Confirm Free Creator/Host sees the basic-only challenge form.
10. Confirm the existing monthly free challenge limit still applies.
11. Confirm sponsor proposal and boost actions are hidden on Free competitor challenge details.
12. Confirm the Free wallet has no earnings or payout section.
13. Confirm Stripe, webhook, and DoroCoin fulfillment behavior is unchanged.
