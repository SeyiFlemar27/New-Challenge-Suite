import type { Firestore } from "firebase-admin/firestore";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { calculateDoroCoinReward, ECONOMY_V1_RULES, ECONOMY_V1_RULE_VERSION, getActiveEconomyRules } from "@/lib/server/economy-rules";
import { deterministicId } from "@/lib/server/idempotency";
import { voteDateKeyForTimeZone, validVotingTimeZone } from "@/lib/server/voting";

export type DoroCoinRewardSource = keyof typeof ECONOMY_V1_RULES.doroCoin.rewards;

const rewardDailyCaps: Partial<Record<DoroCoinRewardSource, number>> = {
  watch_challenge_video: ECONOMY_V1_RULES.doroCoin.caps.videoPerDay,
  like_challenge: ECONOMY_V1_RULES.doroCoin.caps.likesPerDay,
  comment_challenge: ECONOMY_V1_RULES.doroCoin.caps.commentsPerDay,
  share_challenge: ECONOMY_V1_RULES.doroCoin.caps.sharesPerDay,
  sponsored_ad_watch: ECONOMY_V1_RULES.doroCoin.caps.sponsoredAdMax
};

const oncePerActionSources = new Set<DoroCoinRewardSource>(["like_challenge", "referral_signup", "create_free_challenge", "join_free_challenge", "win_free_challenge", "top_10_finish", "profile_verification"]);

export async function awardDoroCoinEngagement(db: Firestore, input: { userId: string; sourceType: DoroCoinRewardSource; actionId: string; challengeId?: string; challengeOwnerId?: string; providerVerified?: boolean; watchedSeconds?: number; requiredWatchSeconds?: number; timeZone?: string; suspiciousSignals?: string[]; rewardAmount?: number }) {
  if (input.challengeOwnerId && input.challengeOwnerId === input.userId && ["watch_challenge_video", "like_challenge", "comment_challenge", "share_challenge"].includes(input.sourceType)) throw new Error("Self-farming activity is not eligible for DoroCoins.");
  if (input.sourceType === "watch_challenge_video" && Number(input.watchedSeconds ?? 0) < Number(input.requiredWatchSeconds ?? 30)) throw new Error("Minimum watch time has not been reached.");
  if (input.sourceType === "sponsored_ad_watch" && !input.providerVerified) throw new Error("Sponsored advertisement rewards require provider verification.");
  const rules = await getActiveEconomyRules(db);
  const localDay = voteDateKeyForTimeZone(new Date(), validVotingTimeZone(input.timeZone));
  const cadenceKey = oncePerActionSources.has(input.sourceType) ? "once" : localDay;
  const idempotencyKey = deterministicId("doro_reward", input.userId, input.sourceType, input.actionId, cadenceKey);
  const dynamicCaps: Partial<Record<DoroCoinRewardSource, number>> = { watch_challenge_video: rules.doroCoin.caps.videoPerDay, like_challenge: rules.doroCoin.caps.likesPerDay, comment_challenge: rules.doroCoin.caps.commentsPerDay, share_challenge: rules.doroCoin.caps.sharesPerDay, sponsored_ad_watch: rules.doroCoin.caps.sponsoredAdMax };
  const cap = dynamicCaps[input.sourceType] ?? rewardDailyCaps[input.sourceType];
  if (cap) {
    const guardId = deterministicId("doro_reward_guard", input.userId, input.sourceType, localDay);
    const actionId = deterministicId("doro_reward_action", idempotencyKey);
    await db.runTransaction(async (transaction) => {
      const guardRef = db.collection("doroCoinRewardDailyGuards").doc(guardId);
      const actionRef = db.collection("doroCoinRewardActions").doc(actionId);
      const [guard, action] = await Promise.all([transaction.get(guardRef), transaction.get(actionRef)]);
      if (action.exists) return;
      const count = Number(guard.data()?.count ?? 0);
      if (count >= cap) throw new Error(`Daily ${input.sourceType.replaceAll("_", " ")} reward limit reached.`);
      const now = new Date().toISOString();
      transaction.set(guardRef, { userId: input.userId, sourceType: input.sourceType, localDay, count: count + 1, cap, ruleVersion: ECONOMY_V1_RULE_VERSION, updatedAt: now }, { merge: true });
      transaction.create(actionRef, { id: actionId, userId: input.userId, sourceType: input.sourceType, actionId: input.actionId, localDay, status: "reserved", createdAt: now });
    });
  }
  if (input.suspiciousSignals?.length) {
    await db.collection("adminActionTasks").doc(deterministicId("doro_review", idempotencyKey)).set({ type: "suspicious_dorocoin_activity", userId: input.userId, sourceType: input.sourceType, challengeId: input.challengeId ?? null, signals: input.suspiciousSignals, status: "open", ruleVersion: ECONOMY_V1_RULE_VERSION, createdAt: new Date().toISOString() }, { merge: true });
  }
  const configuredReward = calculateDoroCoinReward(input.sourceType, rules);
  const amount = input.sourceType === "sponsored_ad_watch" ? Math.min(10, Math.max(5, Number(input.rewardAmount ?? configuredReward))) : configuredReward;
  return applyDoroCoinTransaction(db, { userId: input.userId, amount, type: "reward", sourceType: input.sourceType, description: `DoroCoin reward: ${input.sourceType.replaceAll("_", " ")}`, createdBy: "system", sourceId: input.actionId, idempotencyKey, relatedChallengeId: input.challengeId, ruleVersion: rules.version, auditMetadata: { localDay, cadenceKey, providerVerified: Boolean(input.providerVerified), suspiciousSignals: input.suspiciousSignals ?? [] } });
}

export async function reverseDoroCoinRewardForAction(db: Firestore, input: { userId: string; sourceType: DoroCoinRewardSource; actionId: string; reversedBy: string; reason: string }) {
  const matches = await db.collection("doroCoinTransactions").where("sourceId", "==", input.actionId).limit(20).get();
  const original = matches.docs.find((doc) => doc.data().userId === input.userId && doc.data().sourceType === input.sourceType && Number(doc.data().signedAmount ?? doc.data().amount ?? 0) > 0 && doc.data().status !== "reversed");
  if (!original) return { reversed: false, reason: "No active reward transaction found." };
  const reversal = await reverseDoroCoinReward(db, { transactionId: original.id, reversedBy: input.reversedBy, reason: input.reason });
  return { reversed: true, reversal };
}

export async function awardDoroCoinEngagementSafely(db: Firestore, input: Parameters<typeof awardDoroCoinEngagement>[1]) {
  try {
    return { status: "credited" as const, transaction: await awardDoroCoinEngagement(db, input) };
  } catch (error) {
    return { status: "blocked" as const, message: error instanceof Error ? error.message : "This activity is not eligible for a DoroCoin reward." };
  }
}

export async function reverseDoroCoinReward(db: Firestore, input: { transactionId: string; reversedBy: string; reason: string }) {
  if (input.reason.trim().length < 8) throw new Error("A meaningful DoroCoin reversal reason is required.");
  const originalRef = db.collection("doroCoinTransactions").doc(input.transactionId);
  const original = await originalRef.get();
  if (!original.exists) throw new Error("DoroCoin transaction not found.");
  const data = original.data() ?? {};
  if (Number(data.signedAmount ?? data.amount ?? 0) <= 0) throw new Error("Only a prior DoroCoin credit can be reversed.");
  const reversal = await applyDoroCoinTransaction(db, { userId: String(data.userId), amount: -Math.abs(Number(data.signedAmount ?? data.amount)), type: "reversal", sourceType: "reversal", description: input.reason, createdBy: input.reversedBy, sourceId: input.transactionId, idempotencyKey: deterministicId("doro_reversal", input.transactionId), ruleVersion: String(data.ruleVersion ?? ECONOMY_V1_RULE_VERSION), auditMetadata: { originalTransactionId: input.transactionId } });
  await originalRef.set({ reversedAt: new Date().toISOString(), reversedBy: input.reversedBy, reversalReason: input.reason, reversalTransactionId: reversal.id, status: "reversed" }, { merge: true });
  return reversal;
}

export async function recordDailyLoginAndStreak(db: Firestore, input: { userId: string; timeZone?: string }) {
  const timeZone = validVotingTimeZone(input.timeZone);
  const now = new Date();
  const localDay = voteDateKeyForTimeZone(now, timeZone);
  const stateRef = db.collection("doroCoinStreaks").doc(input.userId);
  const result = await db.runTransaction(async (transaction) => {
    const stateSnap = await transaction.get(stateRef);
    const state = stateSnap.data() ?? {};
    if (state.lastRewardDay === localDay) return { streak: Number(state.currentStreak ?? 1), duplicate: true, milestones: [] as number[] };
    const previousDate = state.lastRewardDay ? new Date(`${state.lastRewardDay}T12:00:00Z`) : null;
    const currentDate = new Date(`${localDay}T12:00:00Z`);
    const consecutive = previousDate && Math.round((currentDate.getTime() - previousDate.getTime()) / 86_400_000) === 1;
    const streak = consecutive ? Number(state.currentStreak ?? 0) + 1 : 1;
    const awardedMilestones = Array.isArray(state.awardedMilestones) ? state.awardedMilestones : [];
    const milestones = [7, 30, 90, 365].filter(
      (day) => streak === day && !awardedMilestones.includes(day)
    );
    transaction.set(stateRef, { userId: input.userId, currentStreak: streak, lastRewardDay: localDay, timeZone, awardedMilestones: [...new Set([...awardedMilestones, ...milestones])], updatedAt: now.toISOString() }, { merge: true });
    return { streak, duplicate: false, milestones };
  });
  if (!result.duplicate) await awardDoroCoinEngagement(db, { userId: input.userId, sourceType: "daily_login", actionId: localDay, timeZone });
  for (const milestone of result.milestones) {
    const reward = ECONOMY_V1_RULES.doroCoin.streaks[milestone as keyof typeof ECONOMY_V1_RULES.doroCoin.streaks];
    await applyDoroCoinTransaction(db, { userId: input.userId, amount: reward.coins, type: "reward", sourceType: "streak_bonus", description: `${milestone}-day DoroCoin streak reward`, createdBy: "system", idempotencyKey: deterministicId("streak", input.userId, milestone), ruleVersion: ECONOMY_V1_RULE_VERSION, auditMetadata: { milestone, badge: reward.badge } });
    if (reward.badge) await db.collection("userAchievements").doc(deterministicId("streak_badge", input.userId, milestone)).set({ userId: input.userId, type: "streak_badge", badgeId: reward.badge, milestone, status: "earned", createdAt: now.toISOString() }, { merge: true });
  }
  return result;
}

export async function transferDoroCoins(db: Firestore, input: { senderId: string; receiverId: string; amount: number; idempotencyKey: string; note?: string }) {
  if (input.senderId === input.receiverId) throw new Error("DoroCoins cannot be transferred to the same account.");
  const rules = await getActiveEconomyRules(db);
  const { minimum, maximum } = rules.doroCoin.transfer;
  if (!Number.isInteger(input.amount) || input.amount < minimum || input.amount > maximum) throw new Error(`DoroCoin transfer must be between ${minimum} and ${maximum}.`);
  const transferId = deterministicId("dorocoin_transfer", input.senderId, input.receiverId, input.idempotencyKey);
  const transferDay = new Date().toISOString().slice(0, 10);
  return db.runTransaction(async (transaction) => {
    const transferRef = db.collection("doroCoinTransfers").doc(transferId);
    const dailyGuardRef = db.collection("doroCoinTransferDailyGuards").doc(deterministicId(input.senderId, transferDay));
    const [existing, dailyGuard] = await Promise.all([transaction.get(transferRef), transaction.get(dailyGuardRef)]);
    if (existing.exists) return { id: transferId, ...existing.data(), idempotentReplay: true };
    const senderRef = db.collection("doroCoinWallets").doc(input.senderId);
    const receiverRef = db.collection("doroCoinWallets").doc(input.receiverId);
    const receiverUserRef = db.collection("users").doc(input.receiverId);
    const [sender, receiver, receiverUser] = await Promise.all([transaction.get(senderRef), transaction.get(receiverRef), transaction.get(receiverUserRef)]);
    if (!receiverUser.exists || receiverUser.data()?.accountStatus === "disabled") throw new Error("The receiving account is not available.");
    const senderBalance = Number(sender.data()?.balance ?? 0);
    const receiverBalance = Number(receiver.data()?.balance ?? 0);
    if (senderBalance < input.amount) throw new Error("Insufficient DoroCoin balance.");
    const transferredToday = Number(dailyGuard.data()?.amount ?? 0);
    if (transferredToday + input.amount > rules.doroCoin.transfer.dailyMaximum) throw new Error("Daily DoroCoin transfer limit reached.");
    const now = new Date().toISOString();
    transaction.set(senderRef, { userId: input.senderId, balance: senderBalance - input.amount, updatedAt: now }, { merge: true });
    transaction.set(receiverRef, { userId: input.receiverId, balance: receiverBalance + input.amount, lockedBalance: Number(receiver.data()?.lockedBalance ?? 0), updatedAt: now }, { merge: true });
    transaction.set(dailyGuardRef, { userId: input.senderId, transferDay, amount: transferredToday + input.amount, ruleVersion: rules.version, updatedAt: now }, { merge: true });
    const record = { id: transferId, senderId: input.senderId, receiverId: input.receiverId, amount: input.amount, note: input.note ?? null, status: "confirmed", ruleVersion: rules.version, createdAt: now, immutable: true, cashOutEnabled: false };
    transaction.create(transferRef, record);
    transaction.create(db.collection("doroCoinTransactions").doc(`${transferId}_out`), { ...record, id: `${transferId}_out`, userId: input.senderId, signedAmount: -input.amount, direction: "debit", balanceBefore: senderBalance, balanceAfter: senderBalance - input.amount, sourceType: "transfer_out", type: "transfer_out", reason: input.note ?? "DoroCoin transfer" });
    transaction.create(db.collection("doroCoinTransactions").doc(`${transferId}_in`), { ...record, id: `${transferId}_in`, userId: input.receiverId, signedAmount: input.amount, direction: "credit", balanceBefore: receiverBalance, balanceAfter: receiverBalance + input.amount, sourceType: "transfer_in", type: "transfer_in", reason: input.note ?? "DoroCoin transfer" });
    return record;
  });
}
