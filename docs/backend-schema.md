# Challenge Suite Backend Schema

The production Firestore data model contract now lives in:

- [Firestore Data Model Contract](./firestore-data-model.md)

That document defines the canonical collections, document shapes, required fields, status enums, indexes, ownership rules, security expectations, and the current API route gaps.

Important current-state note:

- Existing code still uses some legacy collection names, including `doroCoinWallets`, `doroCoinTransactions`, `userConsents`, and `legalDocumentVersions`.
- The production contract uses canonical names: `wallets`, `walletTransactions`, `consents`, and `legalVersions`.
- Before wiring more frontend pages to the backend, choose whether to migrate the current routes to the canonical names immediately or temporarily document compatibility aliases.
