import type { Firestore, Transaction } from "firebase-admin/firestore";

/**
 * Firestore's SDK retries contention, but its query transport can surface a
 * closed transaction as INVALID_ARGUMENT after a lock timeout. Reusing that
 * transaction cannot succeed. Restart the complete atomic callback instead.
 * Callbacks must contain database work only and preserve durable idempotency.
 * Never retry arbitrary INVALID_ARGUMENT errors or any provider side effect.
 */
export async function runFinancialTransaction<T>(
  db: Firestore,
  update: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.runTransaction(update);
    } catch (error) {
      const failure = error as { code?: unknown; details?: unknown; message?: unknown };
      const closed = failure?.code === 3 && (
        failure.details === "Transaction is invalid or closed." ||
        failure.message === "3 INVALID_ARGUMENT: Transaction is invalid or closed."
      );
      if (!closed || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
