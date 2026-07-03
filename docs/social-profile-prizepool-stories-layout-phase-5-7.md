# Phase 5.7: Social Profiles, Prize Pools, Stories, Layout, and Settings

## Implemented foundations

### Prize pools and wallets

- `prizePools` now supports draft, pending funding, funded, held, active, under review, payout review, completed, disputed, cancelled, and legacy compatibility statuses.
- Entry-revenue foundations store gross entry revenue, visible 85% jackpot, hidden 15% platform allocation, paid-entry count, payout review status, and expected winner splits.
- Default expected winner distribution is 60% first, 25% second, and 15% third.
- Public challenge responses expose only visible jackpot, public status, currency, payout review status, and expected winner splits.
- Admin review exposes gross entry revenue, visible jackpot, hidden platform allocation, paid entry count, and payout review status.
- Wallet responses distinguish DoroCoin credits from review-only cash/earnings records.
- Creator/Pro/Host/Enterprise wallet UI shows pending earnings, sponsor earnings, prize winnings, and read-only payout status.
- Sponsor wallet UI shows subscription-separated campaign budget, sponsorship spend, prize contribution, invoice, and report foundations.
- Admin wallet UI shows review categories without release controls.

### Social profiles

Routes:

- `/profile/[username]`
- `/profile/[username]/followers`
- `/profile/[username]/following`
- `/profile/[username]/created`
- `/profile/[username]/participating`
- `/profile/[username]/entries`
- `/profile/[username]/wins`
- `/profile/[username]/activity`
- `/profile/[username]/about`

Public profiles include avatar, cover image, name, username, bio, location, website, plan badge, verification state, counts, follow/share/message controls, tabs, public activity, and achievements.

The follow API uses deterministic records, prevents self-following, toggles without duplicate records, and maintains compatibility count fields. Displayed counts are derived from follow records.

### Brand profiles

Routes:

- `/brands/[brandSlug]`
- `/brands/[brandSlug]/sponsored`
- `/brands/[brandSlug]/campaigns`
- `/brands/[brandSlug]/prize-pools`

Only approved sponsor profiles are public. Campaign budgets and internal financial fields are not exposed.

### Badges

Badge categories support verification, plan, achievement, host, sponsor, and winner badges. Verified and plan badges can be derived for display. Earned and admin-approved achievements remain stored records; the system does not automatically grant every badge.

### Trending stories

Trending stories appear on dashboard and challenge discovery. MVP ordering is active public challenges by participant count.

The story preview includes media, title, summary, creator, public prize state, participants, votes, and actions for details, participation, voting, following, sharing, closing, and next/previous navigation.

Story actions are stored in `challengeStoryEvents`. They do not change challenge ranking or financial state.

### Responsive layout

- User and sponsor shells include mobile hamburger drawers with close controls and route-closing behavior.
- The user drawer locks page scrolling while open.
- Challenge discovery grids stack on mobile and stories scroll horizontally.
- Story previews use mobile full-screen layouts and desktop constrained dialogs.
- Profile, settings, wallet, admin review, and challenge prize layouts use responsive grids.
- Public landing navigation uses a mobile drawer.

### Settings

The old customization promotion was removed from the main settings page. Settings now persist:

- Account and username
- Profile media, bio, location, website, social links, and categories
- Profile visibility and privacy
- Notification channels and event preferences
- Challenge preferences
- Sponsor CTA and campaign defaults

Security sessions, two-factor authentication, invoice sync, and account deactivation remain clearly marked placeholders.

## Financial safety

The following remain inactive:

- Automatic payouts
- Withdrawals
- Automatic refunds
- Sponsor money release
- Paid-entry jackpot payout execution
- DoroCoin-to-cash conversion
- KYC processing
- Admin payout execution
- Live prize release
- Ad-reward DoroCoin fulfillment

All prize and cash records remain review-only. `transferEnabled`, `prizeReleaseEnabled`, `withdrawalsEnabled`, and `moneyMovementEnabled` remain false.

## Test checklist

1. Open a public profile by username and verify private account fields are absent.
2. Follow and unfollow another user; verify self-follow is rejected and duplicates are not created.
3. Open followers/following and each public profile tab.
4. Verify private profiles return not found to other users.
5. Open an approved brand and verify internal budgets are absent.
6. Open dashboard/challenges stories and test close, next, previous, details, join, vote, follow, and share.
7. Confirm story actions appear only in story tracking records.
8. Verify public challenge prize cards omit the platform 15%.
9. Verify admin review shows gross, 85%, 15%, entry count, and payout review status without release controls.
10. Verify role-specific wallet panels never show a withdrawal button.
11. Save profile, privacy, notification, challenge, and sponsor settings.
12. Test user, sponsor, and public mobile drawers at 390px, 430px, and tablet widths.
13. Confirm no page produces horizontal overflow.

## Future work

- Notification delivery worker
- Real-time direct messaging
- Moderation queues for comments and profiles
- Media upload processing
- Stripe invoice synchronization
- Fraud-resistant ad rewards
- Payout provider, KYC, withdrawals, refunds, and sponsor release only after compliance approval
