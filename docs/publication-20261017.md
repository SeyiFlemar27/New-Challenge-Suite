# Challenge Suite — October 17 publication inventory

## Source and preservation

- Workspace: `C:\Dev\New-Challenge-Suite`; branch `main`; upstream `origin/main`.
- Original HEAD: `32434c90fdb96902d9928248ff6381e517688a38`.
- Verified snapshot: `C:/Dev/Backups/New-Challenge-Suite/20261017T185103Z-verified-publication`; 2,966 file hashes; verified Git bundle; no source inventory changes or copy mismatches.
- Initial inventory: **167 entries: 156 INCLUDE, 11 EXCLUDE**. No source, component, API route, library, test or project documentation is excluded.
- The publication report itself is an additional intended documentation file and will be included in the commit.
- Excluded files remain preserved locally. Generated outputs may be refreshed by validation; the verified snapshot also retains their original contents. No excluded file is reset, discarded or deleted.
- Each included content hash was rechecked against the snapshot; high-confidence credential-pattern scanning found no flagged included files. This is not a guarantee that automated scanning detects every secret.

## Complete initial worktree accounting

| Path | Git status | Decision | Category / reason |
|---|---|---|---|
| `app/admin/tournaments/[id]/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/admin/chargebacks/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/admin/operations/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/admin/sponsor-campaigns/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/admin/tournaments/[id]/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/challenges/[id]/publish/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/challenges/[id]/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/challenges/drafts/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/challenges/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/private-challenges/[id]/preview/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/sponsor/agreements/[agreementId]/accept/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/sponsor/challenges/[id]/funding-checkout/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/sponsor/challenges/[id]/interest/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/sponsor/discover/challenges/[challengeId]/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/sponsor/discover/challenges/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/stripe/dorocoin-checkout/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/entry-payment/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/join/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/manage/actions/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/results/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/submissions/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/teams/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/votes/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/votes/route.ts` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/challenges/[id]/bonus-votes/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/checkout/dorocoins/success/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/dorocoins/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/enterprise/challenges/create/official/tournament/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/enterprise/challenges/create/personal/tournament/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/host/tournaments/create/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/sponsor/discover/challenges/[challengeId]/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/sponsor/discover/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/sponsor/funding/[challengeId]/success/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/tournaments/[id]/manage/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/tournaments/[id]/matches/[matchId]/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/tournaments/[id]/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/tournaments/[id]/results/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/tournaments/create/page.tsx` | ` M` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `components/admin/sponsor-campaign-review.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/challenge-builder.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/challenge-controlled-fields.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/challenge-participant-card.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/normal-challenge-builder-steps.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/private-public-voting.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/tournament-builder.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/tournament-match-actions.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/tournament-team-manager.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `components/verification-guard.tsx` | ` M` | INCLUDE | Application components; completed project change retained. |
| `docs/tournament-cloud-tasks-operations.md` | ` M` | INCLUDE | Project documentation; completed project change retained. |
| `lib/api/services.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/challenge-builder-registry.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/challenge-status.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/normal-challenge-builder-model.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/challenge-settlement.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/monetization-payments.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/normal-email.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/prize-funding.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/public-challenge.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/stripe-sponsor-disputes.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-activation.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-cloud-tasks.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-lifecycle-scheduler.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-match-lifecycle-jobs.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-operations.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-paid-entry.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-public-policy.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-public.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-settlement-policy.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-settlement.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-validation.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournaments.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/vote-validation.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/voting.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/withdrawals.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/tournament-types.ts` | ` M` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `next-env.d.ts` | ` M` | EXCLUDE | Generated machine-specific Next/TypeScript output; preserve locally. |
| `scripts/qa/run-p1-browser-e2e.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/run-p0-emulator-regressions.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/submit-review-firestore-contracts.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-challenge-leaderboard-emulator.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-dedicated-discovery-pagination.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-paid-specialized-challenge-settlement-after-admin-approval.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-phase8-tournament-round-progression.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-submission-edit-handler-emulator.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-bracket-round-flow.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-bronze-pause-prize-contracts.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-double-elimination-operations.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-normalized-builder-contracts.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-results-advancement.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-v3-policy.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-voting-judging.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-voting-route.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/ts-alias-loader.mjs` | ` M` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `tsconfig.json` | ` M` | EXCLUDE | Only machine-generated isolated Next build include paths; no functional configuration change. Preserve locally. |
| `tsconfig.tsbuildinfo` | ` M` | EXCLUDE | Generated machine-specific Next/TypeScript output; preserve locally. |
| `.pnpm-store/v11/index.db` | `??` | EXCLUDE | Local package-manager cache; preserve locally. |
| `app/api/tournaments/[id]/adopt-draft-policy/route.ts` | `??` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/media/[asset]/route.ts` | `??` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/prize-funding/route.ts` | `??` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/sponsorship-interests/route.ts` | `??` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/submissions/[submissionId]/media/route.ts` | `??` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/api/tournaments/[id]/team-payment/route.ts` | `??` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/sponsor/discover/tournaments/page.tsx` | `??` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `app/tournaments/[id]/teams/[teamId]/page.tsx` | `??` | INCLUDE | Application routes and user interfaces; completed project change retained. |
| `components/admin/admin-tournament-decisions.tsx` | `??` | INCLUDE | Application components; completed project change retained. |
| `components/tournament-detail-content.tsx` | `??` | INCLUDE | Application components; completed project change retained. |
| `components/tournament-placement-review.tsx` | `??` | INCLUDE | Application components; completed project change retained. |
| `components/tournament-sponsorship-management.tsx` | `??` | INCLUDE | Application components; completed project change retained. |
| `docs/tournament-final-spec-continuation.md` | `??` | INCLUDE | Project documentation; completed project change retained. |
| `docs/tournament-v3-current-spec-audit.md` | `??` | INCLUDE | Project documentation; completed project change retained. |
| `docs/tournament-v3-production-configuration-plan.md` | `??` | INCLUDE | Project documentation; completed project change retained. |
| `lib/automatic-voting-policy.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/sponsor-subject.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-creator-funding.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-draft-adoption.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-entry-provider.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-funding-sources.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-media-verification.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-notifications.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-public-funding.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-public-team.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-result-confirmation.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-sponsor-cutoff.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-sponsor-evidence.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-submission-media.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-team-directory.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-team-entitlements.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-team-entry.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-vote-sequence.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/server/tournament-vote-verification.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/tournament-builder-policy.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/tournament-public-route-policy.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/voting-account-policy.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lib/voting-return-path.ts` | `??` | INCLUDE | Shared policy, services and security/finance implementation; completed project change retained. |
| `lint-batch5b-baseline.json` | `??` | EXCLUDE | Local historical lint report; preserve locally. |
| `lint-batch5b-current.json` | `??` | EXCLUDE | Local historical lint report; preserve locally. |
| `lint-batch5b-group2.json` | `??` | EXCLUDE | Local historical lint report; preserve locally. |
| `lint-batch5b-progress.json` | `??` | EXCLUDE | Local historical lint report; preserve locally. |
| `lint-batch5b-progress2.json` | `??` | EXCLUDE | Local historical lint report; preserve locally. |
| `lint-batch5b-targeted.json` | `??` | EXCLUDE | Local historical lint report; preserve locally. |
| `lint-escaping-targeted.json` | `??` | EXCLUDE | Local historical lint report; preserve locally. |
| `scripts/qa/tournament-browser-worker.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/run-isolated-p0-emulators.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/run-local-verification-suite.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/run-tournament-result-regressions.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/run-tournament-submission-regressions.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-automatic-voting-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-automatic-results-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-complete-lifecycles-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-creator-funding-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-draft-adoption-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-first-voting-cutoff-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-member-payments-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-new-policy.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-notifications-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-public-route-policy.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-public-team-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-settlement-allocation.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-settlement-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-sponsor-cutoff.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-sponsor-lifecycle-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-submission-media-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-team-entitlements-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-vote-pagination-emulator.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |
| `scripts/test-tournament-vote-pagination.mjs` | `??` | INCLUDE | Regression tests and isolated verification tooling; completed project change retained. |

## Publication gates

- Git fetch: completed; local and origin/main initially equal. Recheck immediately before push.
- Vercel project: `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`, team `team_Aof3F7rzekkBNGBsPb6p9XmO`; GitHub `SeyiFlemar27/New-Challenge-Suite`, Production branch `main`, custom-domain auto-assignment enabled.
- Existing Production: `dpl_E39tCfGYn4Knq6CumemmeSTckzeS`, commit equal to original HEAD.
- Fresh typecheck and full ESLint: PASS. Fresh isolated production build: PASS. Existing focused Tournament seven-step Builder/media/128-slot-bracket browser regression: PASS (20 journey assertions plus the no-uncaught-error assertion; remaining journeys intentionally not rerun for this essential publication check). Evidence: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-ZO0qNX` and `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p1-browser-d874e1f1435244d6a53acb6ed9adce83`.
- Most recent implementation verification: P0 68/68 and browser 13/13, 172 assertions; these are completed local results, not live provider evidence.
- Eight live Tournament indexes remain unchanged; no Rules, IAM, queue, provider or environment setting is authorized to change.
- Unconfigured Tournament scheduling/registration/payment operations remain fail-closed. External payouts and unsupported real-money actions must remain disabled.
- Only a normal push to origin/main may trigger deployment; no CLI deployment or manual promotion.
- Publication and live verification results will be reported after the exact pushed commit is checked.
