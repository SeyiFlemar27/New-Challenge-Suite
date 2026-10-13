# Main consolidation release prerequisites

The authoritative workspace is `C:\Dev\New-Challenge-Suite`, with `main`
tracking `origin/main`. Historical development branches and reference worktrees
remain preserved. Vercel project `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX` automatically
deploys pushes to `main`; ordinary releases must use that Git integration.

## Verified index readiness

A read-only `firebase firestore:indexes --project challenge-suite --json` check
on 2026-10-13 returned ten composite indexes: six Explore indexes plus existing
notifications, submissions, and votes indexes. The following repository-defined
query dependencies were absent. All have COLLECTION scope. The user subsequently
approved only these six additive creations. All six were independently rechecked
as READY; the inventory increased to sixteen and the original indexes remained.

| Collection | Fields, in order | Affected query |
| --- | --- | --- |
| challenges | visibility ASC, publicPreviewEnabled ASC, status ASC, __name__ ASC | Private discovery |
| challenges | challengeType ASC, publicPreviewEnabled ASC, status ASC, __name__ ASC | Private compatibility discovery |
| challenges | challengeType ASC, status ASC, __name__ ASC | Tournament and Live Event compatibility discovery |
| challenges | isLiveEvent ASC, status ASC, __name__ ASC | Live Event discovery |
| helpArticles | status ASC, updatedAt DESC | Published Help article listing/search |
| supportTickets | userId ASC, createdAt DESC | Customer request history |

The last two definitions use the provider's implicit descending document-name
field. Publishing this source to GitHub does not deploy Firebase indexes. Obtain
specific approval for any further additive index publication, verify READY
status, and review any additional indexed Tournament jobs before enabling them.
Do not deploy the full manifest blindly or delete existing indexes. Emulator
success does not establish Production composite-index readiness.

## Intentionally unavailable integrations

- Google sign-in is retained behind `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` and
  remains hidden by default pending provider verification.
- Support email delivery requires `SUPPORT_EMAIL_DELIVERY_ENABLED=true` and an
  approved configured provider. Queued messages are not reported as delivered.
- Support AI has no activated provider. No generated diagnosis or customer reply
  is fabricated.
- Support attachment uploads are disabled by default. Enable the server
  `SUPPORT_ATTACHMENT_UPLOADS_ENABLED` and client
  `NEXT_PUBLIC_SUPPORT_ATTACHMENT_UPLOADS_ENABLED` flags only after quarantine
  Rules and trusted scanning are verified. Existing attachments stay quarantined
  until a trusted scanner clears them.
- Support closure has a protected handler but no activated production schedule.
- Tournament activation and match lifecycle scheduling require the documented
  Cloud Tasks configuration and enable flags. Paid Tournament entry remains
  guarded by the Tournament's payment-activation setting.
- Local Stripe fixtures and demo Firebase tests do not verify live payments,
  refunds, disputes, payouts, or operational scheduling.

## Publication procedure after prerequisites pass

Run relevant regression and browser suites, TypeScript, lint, build, and Git diff
checks against the intended commit. Recheck `origin/main`, then use a normal push
of `main`. Monitor the automatically created Vercel Production deployment and
verify its project, branch, exact SHA, READY state, domain aliases, and safe live
smoke tests. No manual Preview promotion substitutes for this workflow.

## Local verification evidence

- Complete P0 runner: 38 suites passed after correcting a discovery fixture to
  use a verified account; its unverified-account rejection assertion remains.
- Support handlers: 82 assertions passed, including default-disabled attachment
  registration and quarantine download denial.
- Final browser regression: nine journeys, 80 assertions, including disabled
  attachment controls; its isolated production build also passed.
- Session restoration now respects the saved Remember Me preference across full
  navigations. The source still enforces standard versus remembered sessions.
- TypeScript, full lint, isolated production builds, and diff checks were run.
  The final release report records the exact final browser/deployment results.
