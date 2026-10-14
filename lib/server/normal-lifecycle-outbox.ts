import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
export function wakeNormalLifecycleJob(db: Firestore, transaction: Transaction, challengeId: string, runAt: string) {
  transaction.set(db.collection("normalLifecycleJobs").doc(`normal_${challengeId}`), { challengeId, version: FieldValue.increment(1), status: "pending", runAt, dispatchState: "pending", updatedAt: runAt }, { merge: true });
}
