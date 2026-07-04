# Phase 6.4: Host Plan Flow

## Effective Host tier

`Host Plan` is displayed only when the canonical plan is `host` and subscription status is `active`, `trial`, or `trialing`. A Host account intent on Free remains `Host Starter`. Paid Host identity uses:

- Plan label: `Host Plan`
- Member label: `Verified Host`
- Dashboard: `Host Control Center`

## Host dashboard

The Host Control Center prioritizes competition operations:

- Host setup checklist
- Hosted competitions
- Upcoming events
- Participant and submission review foundations
- Voting control
- Reports and results
- Team seats
- Revenue and sponsor-request review foundations

Hosted competition links use management language. Generic trending content and badges are no longer primary Host Control Center modules.

## Navigation and gates

Paid Hosts receive Host navigation for participants, submissions, voting control, reports, team members, tournaments, and live events. Each destination is guarded by Host-plan access and either opens a working route or a clearly labeled foundation state.

Free competitors receive `Become a Creator` CTAs. Creator Starter and Creator Plan users receive `Become a Host` CTAs where Host tools are relevant. Paid Hosts do not receive Become Host prompts.

## Post-payment routing

Subscription checkout success includes the requested canonical plan in the safe return URL. The success page polls authenticated profile state and does not grant access itself.

- Confirmed Creator Plan routes to `/onboarding/creator`
- Confirmed Host Plan routes to `/onboarding/host`
- Pending status remains on the confirmation screen
- Unconfirmed status offers retry and return-to-plans actions

Verified Stripe webhooks remain the only source of paid activation.

## Creator onboarding

Creator onboarding records creator niche and profile goal, explains Creator tools, and routes to Creator Studio. The server accepts completion only for an active or trialing Creator Plan.

## Host onboarding

Host onboarding records:

- Organization and event brand
- Location and contact email
- Public profile and logo metadata
- Host type and competition size
- Voting preference
- Event mode
- Required revenue-safety acknowledgement

Completion writes `hostOnboardingComplete` through an authenticated Admin SDK route and routes to `/dashboard/host`. The server accepts completion only for an active or trialing Host Plan.

## Live events and team members

Normal users retain event discovery and registration. Paid Hosts receive owned-event management presentation, status, registration/check-in counts, and a Create Live Event action.

Host Team Members shows three-seat capacity, the owner seat, planned roles, and disabled invitations. No invitation or account access is granted.

## Revenue safety

Wallet & Revenue and Host revenue modules are read-only. Withdrawals, automatic payouts, automatic refunds, sponsor money release, paid-entry prize-pool release, jackpot execution, KYC, ad rewards, DoroCoin conversion, and automatic winner payments remain inactive.

## QA checklist

- Host Starter never displays Host Plan.
- Active/trialing Host displays Host Plan and Verified Host.
- Paid Host `/dashboard` routes to Host onboarding or Host Control Center.
- Paid Creator routes to Creator onboarding until completed.
- Paid Hosts never see Become Host.
- Free competitors see Become a Creator.
- Creator accounts see Become a Host in Host-relevant locations.
- Host sidebar links open guarded destinations.
- Live Events uses discovery mode for normal users and owned-event mode for Hosts.
- Team invitation control remains disabled.
- Checkout success never grants access or credits DoroCoins.
- Onboarding API rejects users without the matching active plan.
- No money movement is enabled.
