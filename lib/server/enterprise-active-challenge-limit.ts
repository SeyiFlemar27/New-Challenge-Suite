import type { DocumentData, Firestore, Transaction } from "firebase-admin/firestore";
import { ENTERPRISE_WORKSPACE_LIMITS } from "@/lib/enterprise-access";
import { activeChallengeLimitStatuses } from "@/lib/server/challenge-lifecycle";

export class EnterpriseActiveChallengeLimitError extends Error {
  readonly activeCount: number;

  constructor(activeCount: number) {
    super("This Enterprise organization has reached its limit of 10 active challenges.");
    this.name = "EnterpriseActiveChallengeLimitError";
    this.activeCount = activeCount;
  }
}

/** Reserve an active slot in the same transaction that creates or activates a challenge. */
export async function prepareEnterpriseActiveChallengeSlot(
  db: Firestore,
  transaction: Transaction,
  organizationId: string | null,
  challengeId: string,
) {
  if (!organizationId) return { apply: () => undefined };

  const quotaRef = db.collection("enterpriseChallengeQuotas").doc(organizationId);
  const reservationRef = db.collection("enterpriseChallengeReservations").doc(challengeId);
  const [quotaSnap, reservationSnap] = await Promise.all([
    transaction.get(quotaRef),
    transaction.get(reservationRef),
  ]);

  // Bootstrap the counter from the authoritative legacy challenge records once. The
  // quota document is read and written in this transaction, serializing first writers.
  const storedCount = Number(quotaSnap.data()?.activeCount);
  let count = Number.isSafeInteger(storedCount) && storedCount >= 0 ? storedCount : 0;
  let legacyReservationDocs: Array<{ id: string; data: DocumentData }> = [];
  if (!quotaSnap.exists || !Number.isSafeInteger(storedCount) || storedCount < 0) {
    const activeQuery = db.collection("challenges")
      .where("organizationOwnerId", "==", organizationId)
      .where("status", "in", activeChallengeLimitStatuses)
      .limit(1000);
    const active = await transaction.get(activeQuery);
    count = active.size;
    legacyReservationDocs = active.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  }

  const alreadyReserved = reservationSnap.exists && reservationSnap.data()?.status === "active";
  if (!alreadyReserved && count >= ENTERPRISE_WORKSPACE_LIMITS.activeChallengeLimit) {
    throw new EnterpriseActiveChallengeLimitError(count);
  }

  return {
    apply: () => {
      const nextCount = alreadyReserved ? count : count + 1;
      transaction.set(quotaRef, {
        organizationId,
        activeCount: nextCount,
        limit: ENTERPRISE_WORKSPACE_LIMITS.activeChallengeLimit,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      for (const legacy of legacyReservationDocs) {
        transaction.set(db.collection("enterpriseChallengeReservations").doc(legacy.id), {
          challengeId: legacy.id,
          organizationId,
          status: "active",
          reservedAt: legacy.data.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          migratedFromChallengeRecord: true,
        }, { merge: true });
      }
      transaction.set(reservationRef, {
        challengeId,
        organizationId,
        status: "active",
        reservedAt: reservationSnap.data()?.reservedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    },
  };
}

/** Release is idempotent and must be called in the transaction changing status to inactive. */
export async function prepareEnterpriseActiveChallengeRelease(
  db: Firestore,
  transaction: Transaction,
  organizationId: string | null,
  challengeId: string,
) {
  if (!organizationId) return { apply: () => undefined };
  const quotaRef = db.collection("enterpriseChallengeQuotas").doc(organizationId);
  const reservationRef = db.collection("enterpriseChallengeReservations").doc(challengeId);
  const [quotaSnap, reservationSnap] = await Promise.all([
    transaction.get(quotaRef),
    transaction.get(reservationRef),
  ]);
  const data = reservationSnap.data();
  if (!reservationSnap.exists || data?.status !== "active" || data?.organizationId !== organizationId) {
    return { apply: () => undefined };
  }
  return {
    apply: () => {
      transaction.set(quotaRef, {
        organizationId,
        activeCount: Math.max(0, Number(quotaSnap.data()?.activeCount ?? 0) - 1),
        limit: ENTERPRISE_WORKSPACE_LIMITS.activeChallengeLimit,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      transaction.set(reservationRef, { status: "released", releasedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    },
  };
}
