import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { writeAuditLog } from "@/lib/server/audit";
import { deterministicId } from "@/lib/server/idempotency";
import { createNotification } from "@/lib/server/notifications";

type Allocation = QueryDocumentSnapshot & { data(): FirebaseFirestore.DocumentData & { userId?: string; remainingAmountCents?: number; expiresAt?: string; status?: string; ruleVersion?: string } };

export async function findExpiredGrowthWalletAllocations(db: Firestore, now = new Date(), limit = 100) {
  const snapshot = await db.collection("creatorGrowthWalletAllocations").where("status", "==", "active").limit(Math.min(Math.max(limit, 1), 250)).get();
  return snapshot.docs.filter((doc) => {
    const expiresAt = Date.parse(String(doc.data().expiresAt ?? ""));
    return Number.isFinite(expiresAt) && expiresAt <= now.getTime() && Number(doc.data().remainingAmountCents ?? 0) > 0;
  }) as Allocation[];
}

export async function expireGrowthWalletAllocation(db: Firestore, allocationId: string, actorId = "system:growth-wallet-expiry", now = new Date()) {
  const allocationRef = db.collection("creatorGrowthWalletAllocations").doc(allocationId);
  const ledgerId = deterministicId("growth_wallet_expiry", allocationId);
  const ledgerRef = db.collection("creatorGrowthWalletTransactions").doc(ledgerId);
  const result = await db.runTransaction(async (transaction) => {
    const allocation = await transaction.get(allocationRef);
    if (!allocation.exists) throw new Error("Growth Wallet allocation not found.");
    const data = allocation.data() ?? {};
    if (data.status === "expired" || (await transaction.get(ledgerRef)).exists) return { allocationId, ledgerId, amountCents: Number(data.expiredAmountCents ?? 0), idempotentReplay: true, userId: String(data.userId ?? "") };
    if (data.status !== "active") return { allocationId, ledgerId, amountCents: 0, idempotentReplay: true, userId: String(data.userId ?? "") };
    const expiresAt = Date.parse(String(data.expiresAt ?? ""));
    if (!Number.isFinite(expiresAt) || expiresAt > now.getTime()) throw new Error("Growth Wallet allocation has not expired.");
    const amountCents = Number(data.remainingAmountCents ?? 0);
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Growth Wallet allocation has no expirable balance.");
    const userId = String(data.userId ?? "");
    if (!userId) throw new Error("Growth Wallet allocation owner is missing.");
    const walletRef = db.collection("creatorGrowthWallets").doc(userId);
    const wallet = await transaction.get(walletRef);
    const balanceBeforeCents = Number(wallet.data()?.balanceCents ?? 0);
    if (balanceBeforeCents < amountCents) throw new Error("Growth Wallet allocation balance mismatch requires admin review.");
    const balanceAfterCents = balanceBeforeCents - amountCents;
    const createdAt = now.toISOString();
    transaction.set(walletRef, { balanceCents: balanceAfterCents, withdrawable: false, restrictedUseOnly: true, updatedAt: createdAt }, { merge: true });
    transaction.create(ledgerRef, { id: ledgerId, userId, allocationId, sourceTransactionId: data.sourceTransactionId ?? allocationId, sourceType: "expiry", amountCents, signedAmountCents: -amountCents, direction: "debit", balanceBeforeCents, balanceAfterCents, reason: "Creator Growth Wallet allocation expired", ruleVersion: data.ruleVersion ?? null, status: "confirmed", withdrawable: false, createdBy: actorId, createdAt, immutable: true });
    transaction.set(allocationRef, { status: "expired", remainingAmountCents: 0, expiredAmountCents: amountCents, expiryLedgerId: ledgerId, expiredAt: createdAt, updatedAt: createdAt }, { merge: true });
    return { allocationId, ledgerId, amountCents, idempotentReplay: false, userId };
  });
  if (!result.idempotentReplay && result.amountCents > 0) {
    const sideEffects = await Promise.allSettled([
      createNotification(db, { userId: result.userId, type: "growth_wallet_expired", title: "Growth Wallet funds expired", body: `$${(result.amountCents / 100).toFixed(2)} in unused Growth Wallet funds expired.`, actionUrl: "/creator/growth-wallet", idempotencyKey: deterministicId("growth_expiry_notice", allocationId), metadata: { allocationId, ledgerId } }),
      writeAuditLog({ actorId, actorType: actorId.startsWith("system") ? "system" : "admin", action: "growth_wallet.allocation_expired", targetType: "growthWallet", targetId: allocationId, reason: "Expired allocation processed from stored expiry metadata.", metadata: { ledgerId, amountCents: result.amountCents, cashWalletChanged: false, doroCoinWalletChanged: false, challengeCreditWalletChanged: false } }, db)
    ]);
    const failedSideEffects = sideEffects.flatMap((item, index) => item.status === "rejected" ? [index === 0 ? "notification" : "audit"] : []);
    if (failedSideEffects.length) {
      await db.collection("adminActionTasks").doc(deterministicId("growth_expiry_side_effect", allocationId)).set({
        type: "growth_wallet_expiry_side_effect_failure",
        allocationId,
        ledgerId,
        failedSideEffects,
        status: "open",
        message: "Growth Wallet expiry completed, but a required follow-up record needs attention.",
        createdAt: now.toISOString()
      }, { merge: true });
    }
  }
  return result;
}

export async function processGrowthWalletExpiryBatch(db: Firestore, input: { actorId: string; reason: string; now?: Date; limit?: number }) {
  const now = input.now ?? new Date();
  const runRef = db.collection("backgroundJobs").doc();
  const run = { id: runRef.id, type: "growth_wallet_expiry", status: "running", triggeredBy: input.actorId, reason: input.reason, startedAt: now.toISOString(), updatedAt: now.toISOString() };
  await runRef.set(run);
  const allocations = await findExpiredGrowthWalletAllocations(db, now, input.limit);
  const results = [];
  const failures = [];
  for (const allocation of allocations) {
    try {
      results.push(await expireGrowthWalletAllocation(db, allocation.id, input.actorId, now));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Growth Wallet expiry failure.";
      failures.push({ allocationId: allocation.id, message });
      await db.collection("adminActionTasks").doc(deterministicId("growth_expiry_failure", runRef.id, allocation.id)).set({ type: "growth_wallet_expiry_failure", allocationId: allocation.id, runId: runRef.id, status: "open", message, createdAt: now.toISOString() }, { merge: true });
    }
  }
  const status = failures.length ? "needs_attention" : "completed";
  await runRef.set({ status, scannedCount: allocations.length, expiredCount: results.filter((item) => !item.idempotentReplay && item.amountCents > 0).length, idempotentCount: results.filter((item) => item.idempotentReplay).length, failureCount: failures.length, failures, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
  return { runId: runRef.id, status, scannedCount: allocations.length, results, failures };
}
