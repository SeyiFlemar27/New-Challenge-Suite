# Live Event working-file inventory

This inventory records the current dirty worktree, not staged or committed files. Original local artifacts remain preserved; no publication is authorized. Test-generated caches can change during validation and are not release source.

| Git status | Path | Treatment |
|---|---|---|
| `??` | `lib/live-event-builder-draft.ts` | Lossless optional-field request compatibility for restored Live Event DTOs; persisted draft records remain unchanged. |
| `??` | `lib/server/live-event-unfulfilled-refunds.ts` | Audited, provider-verified original-charge returns for unfulfilled bookings; never credits ambiguous funding or reverses winner payouts. |
| `??` | `lib/live-event-qr-image.ts` | Local scanner-verified QR encoding selection; identical credentials, standard error correction and manual fallback. |
| `??` | `lib/server/live-event-upgrades.ts` | Approved ownership-bound personal ticket conversion, original payment links and provider-verified restoration helpers. |
| `??` | `lib/server/live-event-creator-earnings.ts` | Approved creator-earnings review and 72-hour clearance of original ledger shares; no duplicate allocation or provider payout. |
| `??` | `app/api/admin/live-event-creator-earnings/route.ts` | Existing single-Admin permission and recent-auth boundaries for creator earnings decisions. |
| `??` | `components/live-event-creator-earnings-review.tsx` | Creator financial review, reasons, confirmations, holds and clearance distinct from winner approval. |
| `??` | `lib/server/live-event-guest-preferences.ts` | Verified guest consent management using existing notification preferences; event/account isolation and idempotent audit. |
| `??` | `app/api/live-events/[id]/email-preferences/route.ts` | Guest-session-only preference access and same-origin mutation boundary. |
| `??` | `components/live-event-guest-email-preferences.tsx` | Guest opt-in/out UI with loading, failure and save states. |
| ` M` | `app/admin/finance/page.tsx` | Live Event financial review integration and accurate separate settlement summary; no unrelated finance behavior removed. |
| `??` | `app/api/admin/live-event-settlements/route.ts` | Existing single-Admin preview, approval and clearance authorization endpoints. |
| `??` | `components/live-event-financial-review.tsx` | Evidence, confirmation, mandatory reason and truthful held/available internal-credit controls. |
| `??` | `lib/server/live-event-settlement.ts` | Transactional source-locked winner allocation and clearance, preserving booking revenue shares. |
| `??` | `docs/live-event-working-file-inventory.md` | This working inventory itself; uncommitted documentation. |
| ` M` | `app/api/admin/refunds/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/admin/reviews/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/challenges/[id]/prize-funding/checkout/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/challenges/[id]/publish/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/challenges/drafts/[id]/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/challenges/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/events/[id]/registrations/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/live-events/[id]/check-in/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/live-events/[id]/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/live-events/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/sponsor/challenges/[id]/funding-checkout/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/stripe/webhook/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/submissions/[id]/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/submissions/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/votes/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/api/wallet/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/enterprise/challenges/create/personal/live/page.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `app/live-events/page.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `components/admin/admin-control-center.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `components/host/host-competition-wizard.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `components/normal-material-review.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `components/verification-guard.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `firestore.indexes.json` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `lib/challenge-builder-registry.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `lib/server/advanced-competitions.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `lib/server/challenge-settlement.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `lib/server/challenge-validation.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `lib/server/monetization-payments.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `lib/server/payout-structure.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `lib/server/prize-funding.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `lib/server/voting.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `next-env.d.ts` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| ` M` | `package.json` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `pnpm-lock.yaml` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/enterprise-private-live-normalized-contracts.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/qa/run-p1-browser-e2e.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/run-isolated-p0-emulators.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/run-local-verification-suite.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/run-p0-emulator-regressions.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/test-advanced-builder-autosave-contracts.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/test-advanced-builders-shared-shell.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/test-live-event-builder-operations.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/test-live-event-builder-preserves-existing-fields.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/test-live-event-builder-uses-standard-vertical-layout.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/test-live-event-no-fake-ticket-payments.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `scripts/test-live-event-registration-checkin-foundation.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| ` M` | `tsconfig.json` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| ` M` | `tsconfig.tsbuildinfo` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `.pnpm-store/v11/index.db` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `app/api/admin/live-event-changes/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/internal/live-event-lifecycle/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/bookings/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/changes/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/checkout/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/earnings/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/guest-verification/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/management/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/messages/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/presentation/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/public/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/refunds/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/staff/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/tickets/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/updates/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/user-state/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/[id]/withdraw/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/api/live-events/configuration/route.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/live-events/[id]/check-in/page.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/live-events/[id]/manage/page.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/live-events/[id]/page.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `app/live-events/[id]/ticket/page.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `components/host/live-event-builder-v2.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `components/live-event-change-proposal.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `components/live-event-management-tools.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `components/live-event-ticket-qr.tsx` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `docs/live-event-implementation-continuation.md` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `docs/live-event-phase-coverage.md` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/live-event-policy.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/live-event-public-route-policy.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/live-event-ticket-code.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-admission.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-cancellation.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-changes.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-checkout.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-communications.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-disputes.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-guests.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-job-outbox.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-jobs.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-payment-evidence.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-payments.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-prizes.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-refunds.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-request-origin.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-reservations.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-results.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-sponsor-cutoff.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-staff.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-updates.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lib/server/live-event-withdrawal.ts` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `lint-batch5b-baseline.json` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `lint-batch5b-current.json` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `lint-batch5b-group2.json` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `lint-batch5b-progress.json` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `lint-batch5b-progress2.json` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `lint-batch5b-targeted.json` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `lint-escaping-targeted.json` | Pre-existing local/generated artifact; preserve, do not stage automatically. |
| `??` | `scripts/test-live-event-admin-refund-contracts.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `scripts/test-live-event-admission-emulator.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `scripts/test-live-event-policy.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `scripts/test-live-event-qr-roundtrip.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `scripts/test-live-event-settlement-boundary.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |
| `??` | `scripts/test-live-event-v2-contracts.mjs` | Implementation/configuration/test/documentation change; uncommitted, verification scope is recorded in the phase coverage report. |

Ignored dependency/build directories and private local environment files are not included in Git's dirty inventory. No secret values are recorded here.
