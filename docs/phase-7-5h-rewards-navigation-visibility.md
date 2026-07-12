# Phase 7.5H - Rewards Navigation Visibility

## Scope

Phase 7.5H is a navigation and visibility hotfix for the production rewards Spin Wheel system. It does not rebuild rewards, grant points, grant spin credits, create prizes, or activate unsafe money movement.

## Sidebar And Menu Changes

The authenticated user navigation now exposes rewards to normal platform participants:

- Rewards -> `/rewards`
- Spin Wheel -> `/rewards/wheel`
- Reward History -> `/rewards/history`

The links were added for:

- Free users
- Creator users
- Creator starter / host starter users
- Host users
- Enterprise users through the host/enterprise navigation model

Sponsors keep their separate sponsor navigation. User reward links were not added to the sponsor dashboard/sidebar to avoid confusing sponsor campaign tools with participant rewards.

## Mobile Navigation

Mobile navigation now includes Rewards for user, creator, host, and enterprise navigation models.

- Normal users: Home, Explore, Create, Rewards, Wallet
- Host/enterprise users: Home, Create, Voting, Rewards, Wallet
- Sponsor users: sponsor-specific mobile items remain unchanged

Rewards routes are treated as active when the current route starts with `/rewards`.

## Dashboard Entry Point

The main dashboard now includes a `Rewards & Spin Wheel` card with:

- feature explanation
- `Open Spin Wheel` CTA
- `View Reward History` CTA

The card is visible even when the user has zero points or zero spin credits.

## Wallet Entry Point

The Wallet / DoroCoin page now includes a rewards cross-link for non-sponsor users:

- explains that DoroCoin purchases earn reward points
- links to `/rewards`
- links to `/rewards/wheel`

Wallet is no longer the only route where users can discover rewards.

## Admin Navigation

Admin navigation already exposes the required rewards operations:

- Reward Overview -> `/admin/rewards`
- Prize Wheel -> `/admin/rewards/prize-wheel`
- Reward Settings -> `/admin/rewards/settings`
- Campaigns -> `/admin/rewards/campaigns`
- Spin History -> `/admin/rewards/spins`
- Fulfilment -> `/admin/rewards/fulfilment`

These links remain inside the admin shell and are protected by admin access checks.

## Rewards Empty State

`/rewards` now includes a clearer zero-state:

- title: `Start earning rewards`
- explains that DoroCoin purchases earn reward points
- explains that thresholds unlock Spin Wheel credits
- includes `Buy DoroCoins`
- includes `View Spin Wheel`

The Spin Wheel remains discoverable even when the user has no spin credits.

## Fallback Prize Behavior

Phase 7.5G found that server default fallback prizes existed until admin prizes were seeded.

Phase 7.5H keeps backend fallback data available as a crash-prevention safety net, but it no longer presents fallback prizes as live production prizes:

- user reward summaries mark `prizeSetupRequired`
- user-facing prize lists are empty when only fallback prizes exist
- `/rewards` shows `The Spin Wheel is being prepared`
- `/rewards/wheel` disables spin with `The Spin Wheel is being prepared. Please check back soon.`
- spin API rejects fallback-only spin attempts with `REWARD_PRIZES_NOT_CONFIGURED`
- admin Prize Wheel page prompts: `No active prize records found. Add prizes to activate the wheel.`

No fake production prize wins are created.

## QA Checklist

- Rewards appears in the user sidebar/menu.
- Spin Wheel is easy to access.
- `/rewards`, `/rewards/wheel`, and `/rewards/history` are reachable from navigation.
- Rewards active state works for `/rewards`, `/rewards/wheel`, and `/rewards/history`.
- Mobile menu includes Rewards.
- Dashboard has Rewards & Spin Wheel CTA.
- Wallet has View Rewards CTA.
- Admin reward links are present in the admin shell.
- Sponsor navigation remains sponsor-specific.
- No frontend reward granting was added.
- No frontend spin-credit granting was added.
- No frontend prize selection was added.
- Default fallback prizes are not shown as live production prizes.

## Remaining P0 Blockers

- Credentialed staging QA still required for user rewards navigation across Free, Creator, Host, and Enterprise account states.
- Admin prize records must be seeded before enabling live production spins.
- Firestore rules should not be broadly published until credentialed rewards QA passes.
- Storage rules remain separate and should not be broadly published until upload QA passes.

## Remaining P1 Issues

- Add richer nested sidebar behavior if the navigation system later supports collapsible groups.
- Add mobile screenshot QA for the new Rewards nav item.
- Add admin prize setup walkthrough once real prize records are approved.
- Expand reward notification entry points after notification delivery is connected.

