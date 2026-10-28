# Notification and backend continuation audit — 27 October 2026

Baseline: `ccf39f987a1bea52bad13f4090bf5ff6ea29e7c5`; fetched origin/main `f6bcadb3f197d1a7f0f9341e340419775a781a9b`, checkpoint ahead one commit. Existing main was fast-forwarded locally to the checkpoint, preserving generated-file changes and untracked artifacts. No push or deployment. Existing recovery/worktrees remain preserved.

## Findings before source implementation

- Shared `notifications` already serves personal/Sponsor dashboards. `createNotification` uses merge-set on retry, resetting read status and timestamps; its event ID is not recipient-scoped, so a shared key can overwrite another recipient.
- History queries limit to 100 before sorting; the API returns 50 and derives unread count from those 50. Mark-all-read examines only the first 100. Neither full history nor global unread count is reliable.
- Bell query is not identity-keyed, has no recurring refresh and ignores HTTP/write failures. Page exposes raw event types, has no pagination/filter and uses an independent cache.
- Settings stores person-level preferences, but Sponsor also has legacy preferences. Tournament/reminder delivery allows legacy inApp/challengeReminders/voteNotifications flags to suppress essential events.
- Reuse Tournament audit-driven delivery, Normal outbox, Live Event jobs/email outbox and support email; no second inbox or customer-support channel.
- Tournament delivery includes Host and actor for all events, producing routine registration/submission noise and potential over-broadcast where match metadata is absent. Event-specific recipient tests are required.
- Live Event promotional announcements bypass shared optional preferences and merge-set inbox records. Reminders are schedule-versioned but organizer-configurable; essential 24h/1h in-app behavior needs separate verification from optional email settings.
- Normal outbox covers voting start/end, but all submission-window/reminder/result/voter-only events are not yet established. Guest-ticket, privacy, confirmed-financial-state and Admin-alert coverage require source-specific verification.
- Historical source-text tests enforce superseded limitations (no chronological query, V1 copy). Replace obsolete assertions with executable behavior tests, retaining authorization/privacy checks.

## Backend investigation boundary

Complete checkpoint regression failed 3/78: Normal paid-entry, Enterprise quota contention and Individual cancellation, with invalid/closed transactions. Publication passed once but remains intermittent. Reproduce with original concurrency and timeouts. Mixed parallel document/query reads and lock ordering are hypotheses, not proven universal causes. No arbitrary retries, timeout increases, error remapping or assertion weakening.

## Acceptance inventory

Required: essential/optional server policy; recipient-scoped IDs preserving read state; chronological pagination; global unread count; bounded complete mark-all; twelve-month logical archive; shared preference defaults; identity-scoped refresh; accessible light inbox/bell; Normal/Private/Tournament/Live/financial/Sponsor/Enterprise/Admin/security event coverage; current-state reminders; voter interest/results; no paid-vote spam; durable recovery without corrupting business commits.

Missing or unverified coverage remains open until executable tests establish it. Emulator success does not verify live email, payments or worker OIDC. No Production scheduling/provider activation. Direct main push remains conditional on full safety verification; do not substitute another branch or push with critical failures.
