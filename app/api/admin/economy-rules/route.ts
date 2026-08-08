import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { ECONOMY_V1_RULES } from "@/lib/server/economy-rules";
import { deterministicId } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "settings.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Economy Rules");
  const [snapshots, doroTransactions, creditTransactions, growthTransactions, paidVoteHolds, unresolvedAllocations, creatorProfiles, actionTasks, growthAllocations, expiryJobs, rewardGuards] = await Promise.all([
    db.collection("economyRuleVersions").limit(25).get(),
    db.collection("doroCoinTransactions").limit(500).get(),
    db.collection("challengeCreditTransactions").limit(500).get(),
    db.collection("creatorGrowthWalletTransactions").limit(500).get(),
    db.collection("paidVoteEconomyHolds").limit(250).get(),
    db.collection("settlementUnresolvedAllocations").limit(250).get(),
    db.collection("profiles").limit(500).get(),
    db.collection("adminActionTasks").limit(250).get(),
    db.collection("creatorGrowthWalletAllocations").limit(500).get(),
    db.collection("backgroundJobs").where("type", "==", "growth_wallet_expiry").limit(25).get(),
    db.collection("doroCoinRewardDailyGuards").limit(500).get()
  ]);
  const versions = snapshots.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  versions.sort((a, b) => Date.parse(String(b.createdAt ?? "")) - Date.parse(String(a.createdAt ?? "")));
  const sum = (docs: FirebaseFirestore.QueryDocumentSnapshot[], field: string) => docs.reduce((total, doc) => total + Math.abs(Number(doc.data()[field] ?? 0)), 0);
  const creatorLevelDistribution = creatorProfiles.docs.reduce<Record<string, number>>((counts, doc) => { const level = String(doc.data().manualCreatorLevelId ?? "calculated"); counts[level] = (counts[level] ?? 0) + 1; return counts; }, {});
  const now = Date.now();
  const jobs = expiryJobs.docs.map((doc) => doc.data()).sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  const topEarners = Object.entries(doroTransactions.docs.filter((doc) => Number(doc.data().signedAmount ?? 0) > 0).reduce<Record<string, number>>((totals, doc) => { const userId = String(doc.data().userId ?? "unknown"); totals[userId] = (totals[userId] ?? 0) + Number(doc.data().signedAmount ?? 0); return totals; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([userId, amount]) => ({ userId, amount }));
  return ok({ activeRules: ECONOMY_V1_RULES, versions, monitoring: { doroCoinTransactionCount: doroTransactions.size, doroCoinVolume: sum(doroTransactions.docs, "signedAmount"), doroCoinReversalCount: doroTransactions.docs.filter((doc) => doc.data().type === "reversal" || doc.data().status === "reversed").length, doroCoinCapHitCount: rewardGuards.docs.filter((doc) => Number(doc.data().count ?? 0) >= Number(doc.data().cap ?? Number.MAX_SAFE_INTEGER)).length, topDoroCoinEarners: topEarners, suspiciousDoroCoinTaskCount: actionTasks.docs.filter((doc) => doc.data().type === "suspicious_dorocoin_activity" && doc.data().status === "open").length, pendingAdWatchConfirmationCount: actionTasks.docs.filter((doc) => doc.data().type === "sponsored_ad_confirmation" && doc.data().status === "open").length, referralReviewCount: actionTasks.docs.filter((doc) => doc.data().type === "dorocoin_referral_review" && doc.data().status === "open").length, challengeCreditTransactionCount: creditTransactions.size, challengeCreditVolume: sum(creditTransactions.docs, "signedAmount"), growthWalletTransactionCount: growthTransactions.size, growthWalletVolumeCents: sum(growthTransactions.docs, "signedAmountCents"), growthWalletExpiredAllocationCount: growthAllocations.docs.filter((doc) => doc.data().status === "expired").length, growthWalletUpcomingExpiryCount: growthAllocations.docs.filter((doc) => doc.data().status === "active" && Date.parse(String(doc.data().expiresAt ?? "")) > now).length, lastGrowthWalletExpiryRun: jobs[0] ?? null, failedGrowthWalletExpiryRunCount: jobs.filter((job) => job.status === "needs_attention" || job.status === "failed").length, paidVoteHoldCount: paidVoteHolds.size, unresolvedHostSponsorAllocationCount: unresolvedAllocations.docs.filter((doc) => doc.data().status === "requires_admin_resolution").length, creatorLevelDistribution, openEconomyActionTaskCount: actionTasks.docs.filter((doc) => doc.data().status === "open" && String(doc.data().type ?? "").match(/economy|dorocoin|credit|growth|paid_entry|paid_vote/)).length } }, "Economy rules loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "settings.editFinancial");
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const action = String(parsed.body?.action ?? "create_draft");
  const reason = String(parsed.body?.reason ?? "").trim();
  if (reason.length < 8) return validationError({ reason: "A meaningful reason of at least 8 characters is required." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Economy Rules");
  const now = new Date().toISOString();
  if (action === "create_draft") {
    const id = deterministicId("economy_rules", Date.now(), user.uid);
    const record = { id, version: id, status: "draft", rules: parsed.body?.rules ?? ECONOMY_V1_RULES, reason, createdBy: user.uid, createdAt: now, updatedAt: now, affectsFutureTransactionsOnly: true };
    await db.collection("economyRuleVersions").doc(id).create(record);
    await writeAuditLog({ actorId: user.uid, actorType: "admin", action: "economy.rules_draft_created", targetType: "economyRuleVersion", targetId: id, reason, after: { status: "draft" } }, db);
    return ok({ version: record }, "Draft economy rule version created.");
  }
  const versionId = String(parsed.body?.versionId ?? "");
  if (!versionId) return validationError({ versionId: "Economy rule version is required." });
  const ref = db.collection("economyRuleVersions").doc(versionId);
  const snap = await ref.get();
  if (!snap.exists) return fail("Economy rule version not found.", 404, undefined, "NOT_FOUND");
  if (action === "submit") {
    if (snap.data()?.status !== "draft") return fail("Only draft economy rules can be submitted.", 409);
    await ref.set({ status: "pending_super_admin_approval", submittedBy: user.uid, submittedAt: now, reason, updatedAt: now }, { merge: true });
    await db.collection("adminActionTasks").doc(deterministicId("economy_approval", versionId)).set({ type: "economy_rule_approval_pending", versionId, status: "open", createdAt: now }, { merge: true });
    return ok({ versionId, status: "pending_super_admin_approval" }, "Economy rules submitted for Super Admin approval.");
  }
  if (action === "approve") {
    if (!user.adminRoles?.some((role) => role === "platform_owner" || role === "super_admin")) return fail("Super Admin or Platform Owner approval is required.", 403, undefined, "SUPER_ADMIN_APPROVAL_REQUIRED");
    if (snap.data()?.status !== "pending_super_admin_approval") return fail("Only submitted economy rules can be approved.", 409);
    const effectiveAt = String(parsed.body?.effectiveAt ?? now);
    await db.runTransaction(async (transaction) => {
      const active = await db.collection("economyRuleVersions").where("status", "==", "active").get();
      for (const doc of active.docs) transaction.set(doc.ref, { status: "retired", retiredAt: now, updatedAt: now }, { merge: true });
      transaction.set(ref, { status: "active", approvedBy: user.uid, approvedAt: now, effectiveAt, reason, updatedAt: now, immutableAfterUse: true }, { merge: true });
    });
    await writeAuditLog({ actorId: user.uid, actorType: "admin", action: "economy.rules_approved", targetType: "economyRuleVersion", targetId: versionId, reason, after: { status: "active", effectiveAt } }, db);
    return ok({ versionId, status: "active", effectiveAt }, "Economy rule version approved for future transactions.");
  }
  return validationError({ action: "Action must be create_draft, submit, or approve." });
}
