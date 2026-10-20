# Remaining external prerequisites — not applied

User confirmed on 20 October 2026 that no Monitoring channel identifier or approved Stripe sandbox/test account identifier is known. No identifier may be inferred from CLI login, billing owner, an environment variable name or local test fixtures. No new notification channel, alert delivery, Stripe account or provider transaction was created during this release verification.

## Monitoring

Fresh read-only inventory: zero notification channels, zero custom alert policies and zero custom log metrics in challenge-suite. Dedicated Tournament queue and keyless identities exist; this is not operational alert coverage. Safest initial destination proposal: one explicitly approved operations email mailbox or maintained group, using Cloud Monitoring's native email notification channel. This avoids introducing an unreviewed messaging provider or webhook secret. It is a proposal, not a selected or verified address. The group must accept Google's alert sender if used.

Required user input/approval:

1. Approved operations mailbox/group and responsible incident owner, supplied privately if preferred.
2. Approval to create the channel in challenge-suite (if the user does not create it themselves), including delivery verification. Record its returned resource name `projects/challenge-suite/notificationChannels/<numeric-id>`; do not invent the number.
3. Review and approve narrowly scoped policies for us-central1/tournament-lifecycle plus the dedicated Scheduler and worker. Record returned alert-policy resource names and verify delivery before registration activation. Do not change Normal scheduling.

Proposed signals for review: Cloud Tasks `cloudtasks.googleapis.com/queue/depth`, `cloudtasks.googleapis.com/queue/task_attempt_count` by response code and `cloudtasks.googleapis.com/queue/task_attempt_delays`; Scheduler failed executions; worker authorization errors; missed reconciliation heartbeat; overdue authoritative activation/match jobs; registration/payment failures. Queue metrics alone do not detect every stuck competition. App/worker logs run on Vercel, so a Google-only log filter must not be claimed to cover them without a verified log integration or an explicitly reviewed application signal. Confirm available metric descriptors, actual data, policy thresholds and notification routing before applying any policy. Task execution logging sampling and custom log metrics would be additional reviewed infrastructure changes with cost implications; none are silently enabled.

Documentation: [Cloud Monitoring notification channels](https://docs.cloud.google.com/monitoring/support/notification-options), [Cloud Tasks metrics and execution logging](https://docs.cloud.google.com/tasks/docs/monitor).

## Stripe provider acceptance

Current code uses existing checkout/payment/webhook/ledger architecture. Local fixtures and demo Firebase suites cover paid individual/team registration, ten-minute reservations, confirmation, expiry, duplicates, late-success recovery, reversals/refund protections and capacity. They do not certify Stripe account linkage or event delivery. Production Vercel metadata has Stripe secret records; their values/account linkage cannot be certified from names. No Production `TOURNAMENT_ENTRY_PAYMENTS_ENABLED` record was returned in the latest metadata inventory; entry payment activation remains unavailable.

Required user input/setup:

1. Select and approve the existing Stripe sandbox/test environment; provide its actual Stripe account ID (`acct_...`) and sandbox identity/name where applicable. Confirm it is authorized for Challenge Suite acceptance testing.
2. Configure test credentials privately in an isolated acceptance environment. Never paste API keys or webhook signing secrets into chat, commit them, or replace production secrets for testing. An existing approved secret-management/CLI connection may be used once identified.
3. Select the isolated application HTTPS endpoint/database and register or verify its webhook event destination; retain the returned webhook/destination ID (for example `we_...`), actual URL and sandbox mode. Do not point synthetic payment events at unrestricted production records. The current handler is `/api/stripe/webhook`.
4. Review endpoint subscriptions against the actual handler: checkout.session.completed, checkout.session.expired, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, refund.updated, and supported charge.dispute.* events. Preserve existing subscription/invoice event handling; do not replace the existing production endpoint configuration.
5. Execute provider-backed test-mode scenarios for individual/team checkout, confirmed payment/entitlement, duplicate delivery, expiration, late payment, refund/reversal handling, ledger invariants and final-slot concurrency. Verify signing-secret validation and rejected invalid signatures. Retain sanitized IDs/results, no credentials or personal data.
6. Independently inspect the intended production account/endpoint linkage read-only, and review paid-entry activation separately. Sandbox success is not permission to run live-money acceptance tests. Existing payout execution remains separately gated.

Documentation: [Stripe sandboxes](https://docs.stripe.com/sandboxes), [Webhook endpoint and signature verification](https://docs.stripe.com/webhooks).

These prerequisites block declaring a complete paid Tournament launch and the coordinated full activation requested by the user. They do not justify skipping independent local release checks or rebuilding completed infrastructure. An authorized disabled-scheduling application stage remains an intermediate step only, subject to its own security, candidate and deployment gates.
