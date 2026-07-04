# Phase 6.8: Premium App Shell, Onboarding, and Sidebar

## Visual system

- Shared cards, buttons, fields, page titles, focus states, and app backgrounds now use a restrained black and gold system.
- Authenticated pages inherit consistent spacing, border treatment, typography hierarchy, and responsive behavior from shared UI primitives.
- The email verification screen remains minimal and does not restore decorative inbox artwork.

## Creator onboarding

- `/onboarding/creator` uses a dedicated full-screen onboarding shell without dashboard navigation.
- The four steps cover welcome and access, creator focus, unlocked tools, and the first action.
- Completion persists through the existing authenticated `/api/onboarding` route.
- Creator access adds creation tools without removing challenge discovery, joining, voting, saving, entries, leaderboards, badges, or DoroCoin access.

## Host onboarding

- `/onboarding/host` uses the same focused shell without the app sidebar.
- The five steps cover Host access, workspace identity, competition defaults, revenue safety acknowledgement, and the first operation.
- Completion still requires an active or trialing Host Plan and persists through `/api/onboarding`.
- Money movement remains inactive.

## Effective-tier badge mapping

| Effective tier | Plan button | Member label |
| --- | --- | --- |
| Free Competitor | Become a Creator | Free Member |
| Creator Starter | Creator Starter | Free Creator |
| Creator Plan | Creator Plan | Creator Member |
| Host Starter | Host Starter | Starter Access |
| Host Plan | Host Plan | Verified Host |
| Enterprise | Enterprise Plan | Enterprise Member |
| Sponsor | Sponsor plan or setup state | Sponsor plan member or Sponsor Setup |

Paid navigation is based on normalized plan and active/trialing status, not account intent alone.

## Creator sidebar

Creator Plan navigation is grouped into Main, Competitions, Creator Tools, Community, and Account.

- Main: Creator Studio, Feed, Favorites, Wallet
- Competitions: Challenges, Create Challenge, My Challenges, My Entries
- Creator Tools: Submissions, Creator Analytics, Monthly Boosts, Sponsor-Ready
- Community: Leaderboards, Winners
- Account: Profile, Settings

Creator Starter keeps a smaller navigation without unlocked analytics, boosts, sponsor, or Host tools.

## Host sidebar

Host Plan navigation is grouped into Main, Competitions, Host Tools, and Account.

- Main: Host Control Center, Feed, Favorites, Private / Exclusive, Wallet & Revenue
- Competitions: Challenges, Create Challenge, My Challenges, My Entries, Live Events, Tournaments
- Host Tools: Participants, Submissions, Voting Control, Reports, Winners, Notifications, Team Members
- Account: Profile, Settings

Duplicate Tournament, Winner, and Host Control Center entries were removed. `/host/team` maps to the existing protected Host team foundation.

## Route map

- Creator foundations: `/creator/submissions`, `/creator/analytics`, `/creator/boosts`, `/creator/sponsor-ready`
- Host operations: `/host/participants`, `/host/submissions`, `/host/voting`, `/host/tournaments`, `/host/reports`, `/host/winners`, `/host/notifications`, `/host/team`
- Existing product routes remain `/private-exclusive` and `/live-events`.

All foundation pages have a title, explanation, empty state, safe next action, and no fake export or financial behavior.

## Known foundations

- Creator analytics, boost selection, and sponsor-ready workspaces are navigation-ready foundations.
- Host team invitations remain disabled.
- Revenue, earnings, sponsor, prize, refund, and payout surfaces remain read-only or review-only.

## QA checklist

- [ ] Creator and Host onboarding render without the app sidebar.
- [ ] Paid Creator shows Creator Plan and Creator Member.
- [ ] Paid Host shows Host Plan and Verified Host.
- [ ] Creator Starter and Host Starter do not receive paid tool navigation.
- [ ] Creator can still explore, join, vote, save, and track entries.
- [ ] Host can still access My Entries without obscuring the Host workflow.
- [ ] Every sidebar destination resolves without a 404.
- [ ] Only one sidebar item is active for nested routes.
- [ ] Mobile navigation does not overflow at 390px or 430px.
- [ ] No payout, withdrawal, refund, sponsor release, prize release, KYC, or DoroCoin-to-cash action is available.
