# Storage Rules media access

## Authorization model

Storage Rules use at most two Firestore documents in one evaluation:

- Public Challenge media: the Challenge document, with the object path checked against its verified `coverImagePath` or server-written `publicMediaPaths`.
- Private Challenge media: the Challenge document plus the server-maintained `challengeMediaAccess/{challengeId}_{uid}` projection.
- Enterprise Challenge media: the Challenge document plus the user's `staffAccess` snapshot. The snapshot includes `organizationStatus`; Storage Rules do not fetch a third organization document.
- Sponsor conversation attachments: the conversation document and, only for Admin fallback, the user's Admin profile document.
- Tournament submissions: the participant and team-membership documents.

The Firestore `challengeMediaAccess` collection is server-maintained and explicitly denied to client reads and writes. Approval/admission routes update it transactionally with the canonical private access or participant record. A server-side media endpoint remains the authorization path for public images and protected media that need richer checks than a direct Storage SDK read can perform.

`publicMediaPaths` is derived from the verified Challenge cover and gallery paths during server-side media verification. Storage Rules require an eligible public Challenge and an exact path match. Private previews expose only the referenced cover image. Trailers, promotional assets, unreferenced files, and private galleries remain protected by direct Storage reads.

Challenge and submission APIs return `/api/challenge-media` URLs for Firebase Storage objects. The endpoint verifies the exact stored path and current visibility/access state before streaming bytes, rejects unsupported media types, supports byte ranges, and sets `Cache-Control: no-store` so a later visibility change cannot leave stale public bytes in a shared cache. Firebase download-token URLs are removed from verified media objects during publication and are not included in public serializers.

## Existing data preparation

New Enterprise grants and Private Challenge approvals/admissions write the required projections. Existing records need an idempotent backfill before publishing the corresponding Storage Rules. The script is dry-run by default, requires an exact `--project-id`, pages reads, and only writes with `--apply`. Applying to `challenge-suite` also requires `--allow-production`.

Dry-run example after confirming the local Firebase Admin configuration:

```powershell
node scripts/backfill-storage-rule-projections.mjs --project-id=challenge-suite
```

The dry run reports aggregate counts only. Review those counts and confirm the target project before separately authorizing an apply run. Do not apply the migration until a verified backup/recovery path and the production IAM prerequisites are confirmed.

## Firebase cross-service Rules permission

Firebase requires the Firebase Storage service agent to have the Google-provided `Firebase Rules Firestore Service Agent` role before Storage Rules can call Firestore. In Google Cloud Console, open **IAM & Admin → IAM**, enable **Include Google-provided role grants**, and inspect the Storage service account whose email ends in `@gcp-sa-firebasestorage.iam.gserviceaccount.com`. Do not add or remove roles as part of this code change. Confirm the grant through authorized project access before publishing the Rules.

## Publication sequence

1. Confirm the correct Firebase project and `(default)` Firestore database.
2. Confirm the Storage service agent's cross-service Rules permission.
3. Run the migration dry-run and review its aggregate counts.
4. Separately authorize and run the backfill, then verify the projected access records.
5. Publish only the reviewed Storage Rules to the confirmed project.
6. Run signed-out public media, private access, Enterprise, Sponsor, and unauthorized-upload smoke tests.

This repository change does not publish Firebase Rules or modify Firebase records.
