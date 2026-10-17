# Tournament final specification — continuation record

Authoritative request: attachment `273ae864-4629-407d-a777-ac802b099f5e`, supplied October 15, 2026. This replaces conflicting older Tournament requirements; existing published commitments must remain compatible.

## Preservation

- Workspace: `C:\Dev\New-Challenge-Suite`; branch `main`; initial HEAD `32434c90fdb96902d9928248ff6381e517688a38`.
- Eleven pre-existing status entries: three generated/type configuration files, `.pnpm-store/`, and seven lint reports. Do not stage these as implementation work.
- Recovery: `C:\Dev\Backups\New-Challenge-Suite\20261015T204630Z-tournament-final-spec`.
- Independently rechecked October 16: 2,905 manifest files, zero source hash differences, zero backup hash differences; Git bundle verified. Restricted local configuration stays inside the protected backup, never in reports or commits.

## Source-confirmed gaps (not runtime verification)

| Area | Existing source evidence | Required work |
| --- | --- | --- |
| Builder | `components/tournament-builder.tsx`, `lib/challenge-builder-registry.ts`: nine sections, numeric navigation, creator voting switch | Seven semantic steps, restoration, ordered rules/instructions, approved controls and accurate review |
| Team payments | `lib/server/tournament-paid-entry.ts`: captain owns one payment and ten-minute team reservation | Versioned per-member payments, locked attempt roster, configurable team window, original-payer reconciliation; preserve legacy payments |
| Registration | `lib/server/tournament-validation.ts`, `tournaments.ts`: private/invite-only configurations accepted | New public/open policy with historical compatibility |
| Voting | Tournament vote route validates match eligibility and atomic wallet debit but uses creator opt-in | Automatic free-first flow, explicit paid consent, return context, preserve published legacy terms across all supported challenge types |
| Results | Results route and vote policy cap evaluation at 5,000 events | Complete paginated event verification with integrity checks and safe transactional finalization |
| Scheduling | Existing authenticated Cloud Tasks adapter and versioned match jobs | Reuse jobs; close automatic result/advancement gaps without adding a parallel scheduler |
| Submissions | Existing revisions and server deadline checks; replacements depend on configuration and approved state | Approved replacement-before-deadline policy with fresh moderation and immutable history |
| Details | `app/tournaments/[id]/page.tsx`: old cards/calendar; match actions expose manual confirmation | Six required tabs, real lifecycle states, accessible round/full bracket, automatic result presentation |
| Prizes | Canonical settlement bridge, verified placement evidence, locked roster and holds exist | Audit entitlement revision and permanent versus temporary ineligibility against new specification; no automatic completed-payout reversal |
| Media | `lib/server/media-inspection.ts` already parses MP4 and AVI | Reuse verified media pipeline; check all new builder controls and policy limits |

## Baseline evidence

- Typecheck: passed on October 16 before implementation.
- Tournament V3 policy: 53 assertions passed using the repository's `ts-alias-loader.mjs`.
- A direct Node invocation without that loader failed alias resolution; this was an incorrect test invocation, not a product defect.
- Full lint: passed. Default-output build stalled before startup both inside and outside the sandbox; stopped only the two owned invocations. The isolated-output production build passed (273 pages). This identifies output-directory interaction as a likely cause, not a proven filesystem root cause. No caches or old build artifacts were deleted.
- Browser, emulator, live provider and new-spec acceptance: not yet verified.

## Execution dependencies

Preserve existing engine and authorization; implement policy versions before changing new-builder defaults. Team checkout, confirmation, refund and activation must be updated together. Do not publish a new per-member UI over captain-only transactions. Do not publish automatic voting UI before server enforcement and legacy compatibility are verified. Production remains unchanged until all required gates pass.

## First completed correction: complete vote-event verification

- Added a constant-memory sequence verifier and a bounded-page Firestore reader; removed the 5,000-event policy cap.
- Both initial results evaluation and transactional revalidation use the same verifier. Existing sequence, tally, target, tie and concurrent-match safeguards remain. Failed reads propagate without finalizing results.
- The pure operations entry point delegates to the same policy; there is no separate tie-resolution implementation.
- Deterministic adapter: 46 assertions passed, including 12,000 events, page boundaries, incomplete streams and read failure.
- Actual demo Firestore: 6 assertions passed, including 6,002 persisted events inside a transaction and duplicate sequence detection across a page boundary. This is Admin SDK transaction verification, not Security Rules or HTTP authorization verification.
- Existing V3 policy: 53 assertions passed after integration. Deadline and team lifecycle static contracts passed. Typecheck passed after route integration; targeted application lint passed. Test scripts are excluded by the existing lint configuration, and are not claimed as lint-verified.
- The isolated build completed before the final results-route integration; it is baseline evidence, not a final release build.
- Build-added `tsconfig.json` includes and `next-env.d.ts` changes were reversed narrowly to retain the user's pre-existing local configuration. Generated build/type artifacts remain excluded from commits.

## Continued implementation checkpoint — October 16

No commit, push, deployment, live financial operation or production configuration change has occurred during this continuation. Main remains at `32434c90fdb96902d9928248ff6381e517688a38`. Unrelated generated files, lint reports and local caches remain preserved.

### Implemented, with focused execution evidence

- Automatic result verification reuses the authorized results service, complete paginated event checks, leased/versioned lifecycle jobs, transaction rechecks and existing advancement. JSON cannot grant worker capabilities.
- Canonical creator funding now supports Tournament drafts, exact saved Base Prize commitments, responsible ownership, duplicate confirmation guards and review cases for successful payments that cannot be credited. Existing Challenge funding remains the default path.
- New-policy teams use individual member payments, persisted preset windows, one atomic temporary team slot, locked consenting rosters, full-payment registration and existing activation jobs. Successful late or incomplete-attempt funds enter canonical review cases; no live refunds were executed.
- Tournament settlement reads canonical Tournament entry payments, conserves revenue and designated funding, applies 60/25/15, retains unawarded bronze funds, and publishes winners atomically with internal settlement. Completed payouts are never reversed.
- Focused runner `scripts/run-tournament-result-regressions.mjs`: all eight tests passed, 203 assertions total: sequence 46; allocation 32; Firestore pagination 6; automatic results 13; actual vote/result handlers 50; creator funding 23; member payments 21; settlement 12. These use demo emulators and deterministic provider objects, not live Stripe.
- The first opponent-voting assertion failed because its fixture reused a Tournament deliberately left in a non-voting state. An isolated fixture corrected the test; the handler security restriction was retained.
- New-policy submission uploads are inspected and copied into a content-addressed server-only namespace, served by an authorization endpoint. Unapproved/rejected media is not public; reviewed bytes survive source mutation. Replacements use expected revision and preserve history. Cross-match content reuse is rejected.
- `scripts/test-tournament-submission-media-emulator.mjs`: 13 actual-handler assertions passed against Auth, Firestore and Storage, including ownership, mandatory Admin confirmation, approved-only public delivery, immutable reviewed media, concurrent revisions and deadline rejection. The test-only existing GCS metadata compatibility wrapper was used; vendor files and live Rules were unchanged.
- Latest successful typecheck and targeted lint preceded the last Details and transaction-roster refinements. Re-run before any release claim.

### Implemented but final verification pending

- Seven-step Builder, semantic draft mapping, restored draft access, ordered rules/instructions, media gallery, Base Prize funding UI and member checkout UI.
- Explicit new-policy draft field allowlist; financial, management and execution state cannot be assigned through the Builder.
- Optional/incomplete drafts save without publication-only Overview requirements. Publication remains strict.
- Admin review/moderation controls with mandatory reason and confirmation. Settlement additionally requires recent authentication and settlement permission. Unsupported legacy audit-only actions now return unavailable rather than claiming success.
- Six-tab Tournament Details with sanitized public props, Round View default and scrollable/zoomable Full Bracket. Published legacy prize percentages are displayed from stored terms.
- Transactional competitor, locked-roster and temporary payout-restriction rechecks, added after the focused settlement run; require fresh emulator execution.

### Still unfinished — do not publish as complete

- Universal automatic Free-first + optional DoroCoin policy across Normal, Private, Live Event and Tournament, including UI, explicit spend consent, wallet/return context and legacy compatibility.
- Complete Builder Review/Edit summaries, restored non-draft messaging, legacy draft adoption and round-content consistency.
- Tournament Details/Match Details browser acceptance, complete 128-slot and Double Elimination/Grand Final reset journeys, responsive and keyboard checks.
- Expanded paid-entry refund/dispute/retry handler coverage and provider test-mode verification. Live payment and payout activation remains unavailable.
- Final Admin review/settlement authorization handler tests and notification/retry outcome coverage.
- Full P0, final production build, full lint, final typecheck and browser suite after all changes.
- Production Git/Vercel/configuration/index readiness refresh, explicit intended staging, safe main push and automatic deployment verification only after all mandatory gates pass.

The original attachment remains the full acceptance specification. This checkpoint records execution evidence and unfinished work; it does not replace or narrow that specification.

## October 16 continuation — supersedes the test counts and open-work list immediately above

- Repository identity rechecked: canonical `C:\Dev\New-Challenge-Suite`, `main`, HEAD `32434c90fdb96902d9928248ff6381e517688a38`, correct GitHub origin. Existing user artifacts remain excluded from intended publication. No commit, push, deployment or live resource change has occurred.
- Universal versioned automatic Free-first voting, explicit paid consent, wallet checks, safe manual DoroCoin return context, published legacy compatibility, and six-tab Details are now implemented. They remain subject to final browser and regression acceptance; the earlier unfinished list is historical.
- Focused nine-test runner previously completed 227 assertions (including 24 automatic-voting assertions). Latest exception-recovery, promotional-media and team-reconciliation test extensions still require fresh execution. Do not claim those extensions passed based on the earlier run.
- Fresh pure policy execution: `test-tournament-new-policy.mjs` 17 assertions passed; `test-tournament-v3-policy.mjs` 55 assertions passed. Fresh typecheck passed before the last team-ledger reconciliation change. Targeted ESLint passed before the last Builder/Match action changes.
- Browser attempt `5d10384d8f8f4d3fad0f6fd0bbaab6e7` failed at exact Category accessible-name matching. Attempt `1d5e5aa473f94a5f8799d061989c51af` passed Category/Subcategory but failed at Full Description exact naming. No complete browser journey passed in those attempts. Explicit taxonomy/description names and role-based select assertions correct the observed label issues without replacing meaningful assertions with sleeps. Preserve both temporary artifact directories as failure evidence.
- Funding check/checkout and Match submission network failures now terminate busy state and report an unconfirmed outcome; they never infer a successful payment or save.
- Public Tournament JSON no longer truncates a 128-slot competition at 100 entrants/matches. Admin match/submission bounds now accommodate the maximum supported Double Elimination bracket. A browser API-count assertion was added and is pending execution.
- Team payments now keep earlier successfully captured member ledger rows explicitly linked to refund review when the registration attempt expires or fails eligibility. Repeated-expiry and newly suspended-member tests were added; pending execution.
- Full P0 first attempt stopped in the existing Normal paid-entry suite with Firestore `INVALID_ARGUMENT: Transaction is invalid or closed` while the separate browser build was active. No production-code workaround was applied. An isolated rerun passed that same suite (27 assertions) and is continuing. This does not yet establish a complete P0 pass or a proven root cause for the first failure.
- Remaining implementation gaps include safe legacy draft adoption, actual Tournament-to-Sponsor agreement/funding integration, complete team/public-profile presentation, remaining notification coverage, expanded complete browser competition journeys, and the final production scheduling/configuration checks. Payment/payout activation must stay disabled until provider-dependent gates pass. No release is authorized by test partial success alone.

## October 17 exact continuation checkpoint

- Identity rechecked: same canonical repository, `main` tracking `origin/main`, HEAD `32434c90fdb96902d9928248ff6381e517688a38`; 115 worktree status entries. No commit, push, deployment, Rules/index publication, or production financial action.
- Isolated member-payment execution passed all 26 assertions, including duplicate confirmation, five teams competing for four slots, original-payer review cases, repeated expiry, and a newly suspended member. Combined execution previously encountered emulator transaction lock timeouts followed by `Transaction is invalid or closed`; do not convert the isolated pass into a full-suite reliability claim.
- Latest automatic-result worker regression passed 14 assertions, including recovered exception resolution. The subsequent focused runner passed the existing 50 voting/result-handler assertions and 23 creator-funding assertions before its member-payment transaction failure. The extended 16 media assertions remain unexecuted in that combined run.
- Full P0 remains incomplete. An expired checkout without a provider Session correctly requires reconciliation: the stale fixture expectation was corrected while retaining no-extra-charge and Support checks. The next run passed the actual submission handler's 63 assertions, then later failed a Private public-voting fixture missing explicit discoverability. That fixture now declares `publicPreviewEnabled: true` and additionally tests denial when disabled; the correction still needs execution.
- Browser attempt `f21ddcfdea9647a5b8fc5ff594d67b82` progressed beyond the fixed labels but received HTTP 403 creating a Tournament because its Creator test account lacked an active Creator plan. The fixture now supplies the same legitimate active-plan and onboarding state used by existing Builder journeys; authorization was not weakened. The subsequent October 17 browser run is pending. Prior browser attempts are failures, not verification.
- Successful fresh checks include typecheck, full configured ESLint, nine Tournament contract suites, standard `git diff --check`, and JavaScript syntax checks. Explicit script lint requests are ignored by the existing ESLint configuration and must not be described as script lint coverage. Re-run gates after any further source changes.
- Legacy drafts now show a truthful preservation hold instead of submitting new policy fields against immutable historical versions. This prevents accidental conversion but does not complete legacy draft conversion/resumption.
- Read-only Cloud Tasks inventory in `challenge-suite` found only `projects/challenge-suite/locations/us-central1/queues/normal-lifecycle`, RUNNING. No Tournament queue was found. Four Tournament-specific Production environment records are also absent (queue, worker URL, enqueuer identity, invoker identity). No resource or environment value was changed; credentials were neither printed nor persisted into reports.
- Private public-voting UI now offers a safe Buy DoroCoins return link preserving Challenge/submission context, displays the verified balance in paid confirmation, and never automatically casts a vote on return. Browser acceptance remains pending.
- Original attachment remains authoritative. Local implementation, complete browser competition coverage, provider-backed verification and production configuration are not complete; no deployment-readiness claim is justified yet.

## October 17 — approved Tournament Sponsor cutoff

The owner explicitly selected **payment confirmation before first voting start**. New Tournament Sponsor reservations close at the first authoritative match voting activation. A prior reservation does not authorize funding confirmed after that cutoff. The separate 15-minute reservation still limits eligible payment timing; it never extends the voting cutoff. Delayed webhook receipt alone does not invalidate independently verified pre-cutoff provider evidence.

- `tournament-sponsor-cutoff.ts` validates the persisted `firstVotingOpenedAt` / `tournamentVotingCutoffAt` against provider completion upper-bound evidence, including its precision interval. Malformed/conflicting cutoffs and ambiguous evidence fail closed.
- Tournament settlement now rechecks prize-designated Sponsor timing against the Tournament document inside its existing settlement transaction. Ineligible already-recorded funds hold settlement for reconciliation, without deleting the liability, silently reducing funding, or rewriting completed payouts.
- This is not a claim that Tournament Sponsor checkout is complete: the existing opportunity/agreement/checkout/dispute paths still require consistent Tournament subject integration. Do not activate that checkout or publish this work based solely on policy-helper tests.
- Deterministic cutoff tests: 13 assertions passed. Actual Firestore settlement tests: 17 assertions passed, including eligible pre-cutoff funds, late-credit settlement holds, ambiguous evidence, and preservation of the original contribution. Public-team projection: 11 Firestore assertions passed after correcting the isolated fixture's `.test` email, which the existing public-directory policy correctly excludes. The initial settlement fixture also used a future timestamp and was corrected to a past fixture date; the production future-evidence guard was preserved.
- These are focused results, not a full P0, browser, production build or live Stripe pass. No commit, push, deployment or live configuration change was performed during this checkpoint.
