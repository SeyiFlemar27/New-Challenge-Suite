# Challenge Suite working and publishing rules

- Use `C:\Dev\New-Challenge-Suite` as the authoritative workspace.
- Use `main` for ordinary development, commits, and pushes. Do not create or switch to another development branch unless the user explicitly authorizes it.
- Verify the repository root, branch, HEAD, upstream, remote, and dirty-file inventory before editing or publishing. Preserve existing source changes, untracked files, local artifacts, and historical worktrees.
- Stage intended application, configuration, documentation, and test files explicitly. Exclude credentials, local environment files, caches, logs, and generated machine-specific build/type files.
- A push to `origin/main` automatically deploys Production through the existing Vercel Git integration. Complete relevant local tests, typecheck, lint, build, and diff checks before pushing. Do not push when a critical verification or dependency is unresolved.
- Keep incomplete or provider-dependent operations fail-closed and accurately described as unavailable. Local mocks and emulators do not verify live payments, email, AI, scanning, or scheduling.
- Use isolated demo Firebase projects and deterministic payment fixtures for tests. Do not perform live financial operations or publish Firebase Rules/indexes without specific authorization.
- After an authorized push, verify the Vercel project, source branch `main`, exact commit SHA, READY status, domain assignments, and safe live smoke tests. Use the automatic Git deployment; do not substitute a manual Preview promotion.
- Do not reset, stash, clean, force-push, or discard work. Do not create routine backups or modify reference worktrees as part of ordinary publishing.
