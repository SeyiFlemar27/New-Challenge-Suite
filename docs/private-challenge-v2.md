# Private Challenge access policy v2

New Private drafts use the shared `normal_v3` builder and lifecycle, with the Access section inserted before Review. Existing legacy challenges and grants are not migrated. Historical draft settings require compatibility review before conversion; they are never silently overwritten.

## Server-only credential configuration

`PRIVATE_INVITE_ENCRYPTION_KEY` must contain a cryptographically random 32-byte key encoded as base64. Store it as a sensitive server-only environment variable. Never use a `NEXT_PUBLIC_` name, a Firebase private key, a checked-in value, or a client-generated credential.

The server stores credential hashes in `privateChallengeInvites` and AES-256-GCM ciphertext in `privateCredentialVault`. Encryption binds ciphertext to the challenge ID. Firestore's existing default-deny Rules protect the new vault; no Rules publication is required. Do not replace the encryption key without a reviewed ciphertext migration or recovery plan. Existing access grants do not depend on decrypting a credential.

Credentials are prepared transactionally at draft creation. Their activation requires the authoritative challenge to be published and registration to be open. Changing the method before publication atomically invalidates the previous credential. After publication the method is immutable. Confirmed rotation replaces only the selected credential and preserves grants and participants.

## Authorization and privacy

- Redemption grants access only. Joining, capacity, payment, eligibility, submissions, voting, and settlement stay with the shared services.
- Persistent request/grant rejection or revocation blocks credential reuse. Only an explicitly confirmed, reasoned creator restoration can reverse it while registration is open.
- Joined participants cannot be ordinarily revoked. Credential-only users are not exposed as a searchable redeemer list.
- Creator management uses the existing personal/Enterprise/Admin authorization gate. Access decisions, media projections, notifications, and audit events are committed together.
- Public previews expose limited metadata. Public voting exposes only approved competing public submissions and calls the existing vote API. It never grants participation access.
- Private paid-entry reservations and confirmation recheck access transactionally. A successful charge after revocation is recorded for existing financial review, never silently enrolled or automatically refunded.
- No new payment, payout, refund, email, scan, or scheduling provider is activated.

## Focused local verification

Run `scripts/run-private-focused-regressions.mjs` through Firebase `emulators:exec` with an isolated `demo-*` project and local Auth, Firestore, and Storage emulator hosts. The runner covers Private v2 actual handlers, legacy request compatibility, shared Normal paid-entry transactions, the Normal builder contract, and invitation enforcement.

Production checks must remain non-mutating. Never create live grants, requests, joins, votes, charges, refunds, or competition outcomes merely to smoke-test deployment.
