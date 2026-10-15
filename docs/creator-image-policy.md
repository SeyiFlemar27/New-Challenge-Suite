# Creator image policy

Normal, Private, Tournament, and Live Event creators (including authorized Host
and Enterprise owners) may upload JPEG, PNG, or WebP images up to **10 MiB
inclusive**. There are no presentation-driven width, height, aspect-ratio, or
DPI requirements. At least one real image is required before completing the
Media step and submitting for Admin Review, not when creating an Overview draft.

The shared uploader calls the authenticated creator-image verification endpoint
after Storage finishes. The server verifies ownership, stored size, object
generation, MIME/decoded-format agreement, checksum, and actual image decoding.
Review submission independently verifies stored images again. Client metadata,
Stripe return URLs, disabled-upload flags, and placeholders are not proof.

The existing 40-million-pixel decoder resource ceiling remains a decompression
safety guard. It is not a recommended design dimension or aspect ratio.
Videos remain optional and retain their existing validation policy.

Participant submissions, avatars, Sponsor assets, documents, and restricted
media retain their existing limits and authorization. The 10 MiB exception is
restricted to creator challenge-image namespaces. Storage publication must
verify the active bucket and reconcile any live Rules drift; a size-only approval
does not authorize replacing an unrelated ruleset.

Private drafts use the authenticated drafts endpoint and server-generated
credentials. Retry keys are owner-bound and transactional. Invitation-code
redemption grants access only; joining, payment, capacity, and deadlines remain
separate server checks. Historical invitation mechanisms are not migrated.

Historical published covers that still reference owner-draft objects are served
through the application only after resolving an exact persisted reference,
checking its creator against the draft owner, and applying current challenge
visibility and viewer authorization. Direct Storage reads remain owner-only;
unreferenced files, unpublished drafts, hidden private images, and draft videos
are not made public. No production records or stored files are migrated.

## Publish verification and diagnostics

GCS metadata PATCH merges keys: token revocation explicitly sets
`firebaseStorageDownloadTokens` to null, then verifies it is absent. Omitting
the key does not revoke it. See the official [metadata deletion contract](https://docs.cloud.google.com/storage/docs/viewing-editing-metadata).
Other custom metadata is preserved. Content-addressed copies use create-only
preconditions; concurrent identical copies are accepted, different bytes are
never overwritten, and existing verified objects are not re-encoded in place.

Failure responses contain a stable category and request reference. Internal
stage/category records are preserved independently of later draft saves; raw
object paths, tokens, and provider errors are not exposed. Configuration,
permissions, token-revocation, and processing failures preserve saved uploads
and ask for a retry rather than an unnecessary replacement.

Firebase CLI 15.22.4's Storage emulator retains a separate download-token list
when the GCS custom metadata key is deleted. The isolated test launcher
`scripts/run-media-publish-emulators.cjs` corrects only that null-PATCH behavior
in emulator memory. It changes neither vendor files nor production code. Tests
must confirm that the old bearer token is rejected, not merely hide metadata.
This compatibility test is not a live Production publication test.
