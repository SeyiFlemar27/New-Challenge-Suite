# Minimal Firestore privacy correction — approval required

Target: `challenge-suite`, Firestore `(default)`. No deployed Rules have been changed.

The deployed Rules currently allow anonymous reads of every `challenges` and `submissions` document, and signed-in reads of every `votes` document. This bypasses private/draft/suspended-content projection and hidden-vote controls in the server APIs. No real private record was read to demonstrate this finding.

The source Rules already deny these direct reads. The proposed production candidate starts from the freshly retrieved deployed Rules and changes only these three collection clauses to `allow read, write: if false;`:

- `/challenges/{challengeId}`
- `/submissions/{submissionId}`
- `/votes/{voteId}`

Every other deployed rule remains unchanged. Public discovery, authorized private access, public approved submissions and voting use the existing server APIs. The application source imports the client Firestore package only for Firebase initialization; no direct client document-read dependency on these collections was found. Trusted server access continues through Admin SDK authorization and existing application guards.

Reviewable files in `docs/qa/automatic-publishing-20261020/`:

- `deployed-firestore-rules-before-20261020.rules`: exact deployed baseline retrieved during this task.
- `proposed-firestore-private-content-20261020.rules`: three-clause candidate.

Firebase's validator accepted the candidate with no errors. An isolated demo-emulator regression reproduces the deployed exposure with synthetic private draft/rejected submission/raw-vote fixtures, then confirms the candidate denies the bypass while preserving trusted backend reads, owner profile reads, public legal documents and server-only finance protections. It does not mutate production Rules or records. See `scripts/test-deployed-firestore-rule-repair-emulator.mjs` and local log `automatic-publishing-firestore-rule-repair-emulator.log`.

Proposed execution after explicit approval: re-read the current deployed Rules and require an exact normalized match with the reviewed baseline; stop on concurrent differences. Publish only this candidate to the existing Firestore Rules release, without indexes or Storage Rules. Retrieve the serving release and verify its source matches the approved candidate. Do not read existing private creator documents as a smoke test. Preserve the baseline Ruleset/release identity for incident recovery.

Impact: direct anonymous/client SDK reads of these three collections will be denied; their authorized server APIs remain available. A legacy external client depending on the overly broad direct reads would lose that access. Do not automatically restore insecure public reads as an application rollback. No database migration, document write, role change or broader Rules deployment is included.
