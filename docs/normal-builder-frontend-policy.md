# Normal Builder frontend policy — 2026-10-13

The Normal Builder has seven visible steps: Overview, Monetization & Prize Pool,
Media & Branding, Schedule, Entry & Submission, Review, Publish. The frontend
maps them to existing API positions 0, 2, 3, 4, 5, 6, 7. Old Participation
position 1 resumes at Overview. No database fields or backend rules changed.

Capacity, waitlist and participant-list controls are removed from this creation
UI. Existing values are retained. Sponsorship exposes one checkbox; historical
preference fields remain preserved. Ordered instructions are optional in the
form. Voting configuration uses the existing allowPaidVotes field and remains
subject to paid-plan and server eligibility; additional supported votes cost
5 DoroCoins. No new payment or voting mechanism is introduced.

Only server-returned confirmed creator funding satisfies a positive Base Prize.
Sponsor contributions, projected revenue and pending checkout do not satisfy it.
Draft updates omit server-controlled payment, checkout, ledger and payout
activation/status flags. Publication carries stored values instead of form
defaults; the existing server remains responsible for the resulting state.
Funding does not block earlier steps, but incomplete funding blocks submission.
Finish Later and the funding link wait for a successful serialized draft save.

## Focused browser verification

Use the existing production-mode browser runner with a demo Firebase project,
isolated Auth/Firestore/Storage ports, `CHALLENGE_SUITE_E2E_JOURNEY=Normal Builder seven-step`
and `CHALLENGE_SUITE_E2E_MEDIA_UPLOADS_ENABLED=true`. This explicitly enables
Storage-emulator uploads for the new journey without changing the existing
upload-disabled QA default. Funding statuses use named demo-server fixtures,
not real Stripe payments. Other journeys are reported as skipped when filtered.

## Publication blockers requiring a separate backend phase

- Normal server readiness still rejects zero winner cash amounts.
- Server readiness still requires a nonempty submission instruction list.
- The draft API also gates saved step advancement on those older requirements.
  Review/Publish may be inspected locally, while progress is saved at the last
  compatible server position. Restoring such a draft returns to that position;
  the frontend does not claim that the server has unlocked or accepted it.
- Free-plan publication additionally requires a confirmed creator-funded prize
  when prize funding is requested; the frontend does not bypass this condition.
- Existing funding checkout requires at least $5 and refuses a new checkout
  after any creator funding is confirmed. Partial top-ups cannot be invented.
- Paid-plan monthly usage is enforced by the existing server; only Free lifetime
  usage is exposed by the current usage endpoint for an upfront frontend gate.
- The current publication service only explicitly enforces creator funding for
  Free publication. All-tier, transactional enforcement of a positive Base Prize
  remains backend work; frontend gating alone cannot secure direct API calls.
- Legacy age/location and joining restrictions are retained rather than reset
  by form defaults. Current normal_v3 validation retires age/location settings,
  and publication forces automatic joining. Incompatible legacy drafts are held
  for backend compatibility review rather than weakening their restrictions.

Publish displays the applicable blockers. Do not push this change to the
Production branch until optional-prize and optional-instruction policies are
compatible with the server and the combined implementation is verified.

## Approved future design specification — not implemented in this change

For Private, Tournament and Live Event: creator/authorized-owner Base Prize is
optional. A positive obligation must be fully confirmed before Admin review;
blank/zero creates no new obligation. Confirmed sponsor prize funding remains
separate and never substitutes for the owner's guarantee. Sponsors choose
amounts through existing supported workflows. Financial shares remain
server-authoritative; historical monetary commitments must be preserved.

Preserve each builder's distinctive access, team, competition, venue, judging
and prize-format requirements. Tournament and Live Event keep Participation /
Registration configuration. Private's standalone Participation step may be
removed in a later separately scoped implementation. None of these three
builders is changed here.
