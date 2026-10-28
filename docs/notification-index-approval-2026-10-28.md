# Exact notification index approval request — 28 October 2026

Target: existing project `challenge-suite`, Firestore `(default)`, Standard edition, `nam5`.

Read-only Query Explain with `analyze:false` successfully planned ordinary history using the existing `(userId ASC, createdAt DESC, __name__ DESC)` composite. Unread history/count and archived-unread count failed with `FAILED_PRECONDITION: no matching index found`. No document queries or Production writes were performed. See `notification-index-analysis-2026-10-28.json` and its analysis script.

## Smallest proposed additions

The exact create-only definitions are in `notification-index-minimal-2026-10-28.json`:

1. `notifications`: `userId ASC, status ASC, createdAt DESC`.
2. `notifications`: `userId ASC, read ASC, createdAt DESC`.
3. `notifications`: `userId ASC, status ASC, read ASC, createdAt DESC`.

Firestore appends `__name__ DESC`. Both history and aggregation queries explicitly use the same descending date order. This replaces the earlier six-candidate proposal: ascending date variants are unnecessary. The third index supports subtracting legacy archived records whose `read` remains false, without scanning history or rewriting records. Existing history/pagination/retention reuse the existing index. Mark-all uses bounded recipient/document-ID pages.

## Exact approval scope and verification

Specific approval is required to create these three indexes in the existing default database. Use create-only Admin API requests; do not bulk-replace or delete existing indexes, change Rules, modify documents, provision another database, activate schedulers or alter provider configuration. Read index build status until READY, then repeat analysis-only Query Explain for all query shapes before allowing a main push. Record actual build IDs and outcomes privately/sanitized as appropriate.

Index backfill may take time and uses storage; subsequent notification writes maintain the additional indexes, with associated index storage/write overhead. No reliable cost amount is asserted without actual volume and billing data. No application document migration or financial mutation is required.

No approved isolated hosted Standard database is currently available. Emulator acceptance establishes query results and ownership, not hosted index availability. Production analysis-only planning is the available non-mutating verification. Until authorized creation and READY/planning verification (or an independently verified safe alternative), the main push remains blocked.

## Approved execution results

The owner expressly approved only the three COLLECTION-scoped definitions in the minimal JSON. The creation utility verified the project, database edition and exact definitions before creating missing indexes. All three reported READY. Read-only Query Explain (analyze:false) subsequently planned every required notification history, unread, mark-all, archival and delivery-source query. See notification-index-execution-2026-10-28.json and notification-index-analysis-2026-10-28.json.

The first attempt failed while listing indexes because the API rejected a pageSize parameter; no index had been created by that attempt. Removing the unsupported listing parameter allowed the approved operation to complete. Existing indexes, documents and Security Rules were not modified or deleted. No notification or financial Production document writes were performed.
