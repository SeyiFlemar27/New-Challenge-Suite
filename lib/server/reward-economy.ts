import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";

export const REWARDABLE_EVENT_TYPES = [
  "profile_completed",
  "account_verified",
  "approved_submission",
  "challenge_participation_completed",
  "valid_free_vote",
  "challenge_first_place",
  "challenge_second_place",
  "challenge_third_place",
  "individual_tournament_champion",
  "winning_team_tournament_member"
] as const;

export type RewardableEventType = (typeof REWARDABLE_EVENT_TYPES)[number];
export type MeaningfulRewardActivity = Extract<RewardableEventType, "approved_submission" | "challenge_participation_completed" | "valid_free_vote"> | "live_event_check_in" | "tournament_check_in";
export type RewardEntitlementType = "free_entry" | "fixed_entry_discount" | "percentage_entry_discount" | "creator_boost" | "bonus_spin" | "badge";

export const DEFAULT_REWARD_RULES: Record<RewardableEventType, { points: number; once: boolean; dailyCap?: number }> = {
  profile_completed: { points: 50, once: true },
  account_verified: { points: 50, once: true },
  approved_submission: { points: 50, once: false },
  challenge_participation_completed: { points: 75, once: false },
  valid_free_vote: { points: 5, once: false, dailyCap: 50 },
  challenge_first_place: { points: 250, once: false },
  challenge_second_place: { points: 150, once: false },
  challenge_third_place: { points: 100, once: false },
  individual_tournament_champion: { points: 300, once: false },
  winning_team_tournament_member: { points: 300, once: false }
};

export const STREAK_MILESTONES = [
  { days: 3, points: 25, badgeId: null },
  { days: 7, points: 50, badgeId: "7-day-streak" },
  { days: 14, points: 100, badgeId: null },
  { days: 30, points: 250, badgeId: "30-day-streak" }
] as const;

export const ACHIEVEMENT_CATALOG = [
  { id: "first-approved-submission", counter: "approvedSubmissions", threshold: 1, points: 25, badgeId: null },
  { id: "first-challenge-completion", counter: "challengeCompletions", threshold: 1, points: 25, badgeId: null },
  { id: "ten-approved-submissions", counter: "approvedSubmissions", threshold: 10, points: 100, badgeId: "submission-streak" },
  { id: "ten-challenge-completions", counter: "challengeCompletions", threshold: 10, points: 150, badgeId: "challenge-finisher" },
  { id: "one-hundred-valid-free-votes", counter: "validFreeVotes", threshold: 100, points: 100, badgeId: "community-voter" },
  { id: "first-podium", counter: "podiums", threshold: 1, points: 50, badgeId: "first-podium" },
  { id: "five-podiums", counter: "podiums", threshold: 5, points: 150, badgeId: "podium-regular" }
] as const;

const MEANINGFUL_ACTIVITY = new Set<MeaningfulRewardActivity>([
  "valid_free_vote", "approved_submission", "challenge_participation_completed", "live_event_check_in", "tournament_check_in"
]);
const PLACEMENT_EVENTS = new Set<RewardableEventType>(["challenge_first_place", "challenge_second_place", "challenge_third_place", "individual_tournament_champion", "winning_team_tournament_member"]);

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function rewardDateKey(date: Date, timeZone: string) {
  let zone = timeZone || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(date); } catch { zone = "UTC"; }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isConsumerRewardsEligible(profile: Record<string, unknown>) {
  const accountType = String(profile.accountType ?? profile.role ?? profile.dashboardType ?? "user").toLowerCase();
  const operational = profile.isAdmin === true || profile.isStaff === true || ["admin", "staff", "sponsor", "brand", "enterprise", "enterprise_sponsor"].includes(accountType);
  const restricted = profile.rewardsRestricted === true || ["suspended", "deleted", "disabled"].includes(String(profile.accountStatus ?? "active").toLowerCase());
  return { eligible: !operational && !restricted, operational, restricted, accountType };
}

function counterForEvent(eventType: RewardableEventType) {
  if (eventType === "approved_submission") return "approvedSubmissions";
  if (eventType === "challenge_participation_completed") return "challengeCompletions";
  if (eventType === "valid_free_vote") return "validFreeVotes";
  if (PLACEMENT_EVENTS.has(eventType)) return "podiums";
  return null;
}

function writeLedger(transaction: Transaction, db: Firestore, input: { id: string; userId: string; direction: "credit" | "debit"; amount: number; sourceType: string; sourceId: string; sourceEventKey: string; description: string; metadata?: Record<string, unknown>; createdAt: string }) {
  const record = { ...input, immutable: true, currency: "REWARD_POINTS", cashValue: null, withdrawable: false };
  transaction.create(db.collection("rewardLedgerEntries").doc(input.id), record);
  transaction.create(db.collection("rewardAccounts").doc(input.userId).collection("ledger").doc(input.id), record);
}

function badgePayload(userId: string, badgeId: string, sourceType: string, sourceId: string, now: string) {
  return { id: deterministicId("reward_badge", userId, badgeId), userId, badgeId, source: sourceType, sourceId, status: "earned", displayPublicly: false, earnedAt: now, createdAt: now, updatedAt: now };
}

export async function grantRewardPointsForEvent(db: Firestore, input: { userId: string; eventType: RewardableEventType; sourceId: string; sourceEventKey?: string; metadata?: Record<string, unknown>; occurredAt?: string }) {
  if (!REWARDABLE_EVENT_TYPES.includes(input.eventType)) throw new Error("REWARD_EVENT_TYPE_NOT_REGISTERED");
  const now = input.occurredAt ?? new Date().toISOString();
  const eventKey = input.sourceEventKey ?? `${input.eventType}:${input.sourceId}:${input.userId}`;
  const eventId = deterministicId("reward_event", eventKey);
  const [settingsSnap, ruleSnap, userSeedSnap, profileSeedSnap] = await Promise.all([
    db.collection("rewardSettings").doc("default").get(),
    db.collection("rewardRules").doc(input.eventType).get(),
    db.collection("users").doc(input.userId).get(),
    db.collection("profiles").doc(input.userId).get()
  ]);
  const settings = settingsSnap.data() ?? {};
  const defaultRule = DEFAULT_REWARD_RULES[input.eventType];
  const rule = ruleSnap.data() ?? {};
  const configuredPoints = amount(rule.points ?? defaultRule.points);
  const active = rule.active !== false;
  const seedProfile = { ...(profileSeedSnap.data() ?? {}), ...(userSeedSnap.data() ?? {}) };
  const timeZone = String(seedProfile.timeZone ?? seedProfile.timezone ?? settings.accountTimeZone ?? "UTC");
  const dayKey = rewardDateKey(new Date(now), timeZone);

  return db.runTransaction(async (transaction) => {
    const accountRef = db.collection("rewardAccounts").doc(input.userId);
    const legacyRef = db.collection("userRewards").doc(input.userId);
    const userRef = db.collection("users").doc(input.userId);
    const profileRef = db.collection("profiles").doc(input.userId);
    const eventRef = db.collection("rewardEvents").doc(eventId);
    const dailyRef = db.collection("rewardDailyCaps").doc(deterministicId("reward_daily_cap", input.userId, input.eventType, dayKey));
    const [accountSnap, legacySnap, userSnap, profileSnap, eventSnap, dailySnap] = await Promise.all([
      transaction.get(accountRef), transaction.get(legacyRef), transaction.get(userRef), transaction.get(profileRef), transaction.get(eventRef), transaction.get(dailyRef)
    ]);
    if (eventSnap.exists) return { awarded: false, duplicate: true, pointsAwarded: 0, eventId };
    const profile = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) };
    const eligibility = isConsumerRewardsEligible(profile);
    if (!eligibility.eligible) return { awarded: false, duplicate: false, pointsAwarded: 0, eventId, skipped: eligibility.restricted ? "rewards_restricted" : "operational_account_excluded" };

    const account = accountSnap.data() ?? {};
    const legacy = legacySnap.data() ?? {};
    const previousBalance = amount(account.availablePoints ?? legacy.availableRewardPoints ?? userSnap.data()?.voterPoints);
    const previousLifetime = amount(account.lifetimeEarned ?? legacy.lifetimeRewardPoints);
    const previousDebt = amount(account.rewardDebt);
    const counterKey = counterForEvent(input.eventType);
    const counters = { ...((account.counters && typeof account.counters === "object") ? account.counters as Record<string, number> : {}) };
    if (counterKey) counters[counterKey] = amount(counters[counterKey]) + 1;
    const achievementCandidates = ACHIEVEMENT_CATALOG.filter((item) => item.counter === counterKey && amount(counters[counterKey]) >= item.threshold);
    const achievementRefs = achievementCandidates.map((item) => db.collection("rewardAchievements").doc(deterministicId("reward_achievement", input.userId, item.id)));
    const achievementSnaps = await Promise.all(achievementRefs.map((ref) => transaction.get(ref)));

    const dailyUsed = amount(dailySnap.data()?.pointsAwarded);
    const cap = amount(rule.dailyCap ?? defaultRule.dailyCap);
    const baseAward = settings.rewardEarningPaused === true || !active ? 0 : cap ? Math.min(configuredPoints, Math.max(0, cap - dailyUsed)) : configuredPoints;
    const newlyEarnedAchievements = achievementCandidates.filter((_, index) => !achievementSnaps[index].exists);
    const achievementPoints = newlyEarnedAchievements.reduce((sum, item) => sum + item.points, 0);
    const grossCredit = baseAward + achievementPoints;
    const debtPaid = Math.min(previousDebt, grossCredit);
    const spendableCredit = grossCredit - debtPaid;
    const nextBalance = previousBalance + spendableCredit;
    const nextDebt = previousDebt - debtPaid;

    transaction.create(eventRef, { id: eventId, userId: input.userId, eventType: input.eventType, sourceId: input.sourceId, sourceEventKey: eventKey, ruleVersionId: String(rule.versionId ?? "launch-v1"), status: baseAward > 0 ? "processed" : settings.rewardEarningPaused === true ? "earning_paused" : active ? "cap_reached" : "rule_inactive", pointsAwarded: baseAward, metadata: input.metadata ?? {}, createdAt: now });
    if (MEANINGFUL_ACTIVITY.has(input.eventType as MeaningfulRewardActivity)) {
      const activityRef = db.collection("rewardActivityDays").doc(deterministicId("reward_activity", input.userId, dayKey));
      transaction.set(activityRef, { id: activityRef.id, userId: input.userId, dayKey, timeZone, eventTypes: FieldValue.arrayUnion(input.eventType), lastActivityAt: now, updatedAt: now }, { merge: true });
    }
    if (baseAward > 0) {
      const ledgerId = deterministicId("reward_ledger", eventId, "base");
      writeLedger(transaction, db, { id: ledgerId, userId: input.userId, direction: "credit", amount: baseAward, sourceType: input.eventType, sourceId: input.sourceId, sourceEventKey: eventKey, description: `Reward Points earned: ${input.eventType.replaceAll("_", " ")}.`, metadata: input.metadata, createdAt: now });
      transaction.set(dailyRef, { id: dailyRef.id, userId: input.userId, eventType: input.eventType, dayKey, pointsAwarded: dailyUsed + baseAward, updatedAt: now }, { merge: true });
    }
    newlyEarnedAchievements.forEach((achievement) => {
      const claimRef = db.collection("rewardAchievements").doc(deterministicId("reward_achievement", input.userId, achievement.id));
      transaction.create(claimRef, { id: claimRef.id, userId: input.userId, achievementId: achievement.id, status: "earned", pointsAwarded: achievement.points, badgeId: achievement.badgeId, earnedAt: now, createdAt: now });
      writeLedger(transaction, db, { id: deterministicId("reward_ledger", claimRef.id), userId: input.userId, direction: "credit", amount: achievement.points, sourceType: "achievement", sourceId: achievement.id, sourceEventKey: `achievement:${achievement.id}:${input.userId}`, description: `Achievement earned: ${achievement.id.replaceAll("-", " ")}.`, createdAt: now });
      if (achievement.badgeId) {
        const badge = badgePayload(input.userId, achievement.badgeId, "achievement", achievement.id, now);
        transaction.set(db.collection("userBadges").doc(badge.id), badge, { merge: true });
      }
    });
    transaction.set(accountRef, { userId: input.userId, availablePoints: nextBalance, lifetimeEarned: previousLifetime + grossCredit, rewardDebt: nextDebt, counters, status: eligibility.restricted ? "restricted" : "active", updatedAt: now, createdAt: account.createdAt ?? now }, { merge: true });
    transaction.set(legacyRef, { userId: input.userId, availableRewardPoints: nextBalance, lifetimeRewardPoints: previousLifetime + grossCredit, rewardDebt: nextDebt, updatedAt: now }, { merge: true });
    transaction.set(userRef, { voterPoints: nextBalance, updatedAt: now }, { merge: true });
    return { awarded: grossCredit > 0, duplicate: false, pointsAwarded: grossCredit, basePointsAwarded: baseAward, achievementPointsAwarded: achievementPoints, debtPaid, availablePoints: nextBalance, eventId };
  });
}

export async function recordMeaningfulRewardActivity(db: Firestore, input: { userId: string; activityType: MeaningfulRewardActivity; sourceId: string; occurredAt?: string }) {
  if (!MEANINGFUL_ACTIVITY.has(input.activityType)) throw new Error("MEANINGFUL_ACTIVITY_NOT_ALLOWED");
  const now = input.occurredAt ?? new Date().toISOString();
  const [userSnap, profileSnap] = await Promise.all([db.collection("users").doc(input.userId).get(), db.collection("profiles").doc(input.userId).get()]);
  const profile = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) };
  if (!isConsumerRewardsEligible(profile).eligible) return { recorded: false, reason: "account_not_eligible" };
  const timeZone = String(profile.timeZone ?? profile.timezone ?? "UTC");
  const dayKey = rewardDateKey(new Date(now), timeZone);
  const id = deterministicId("reward_activity", input.userId, dayKey);
  await db.collection("rewardActivityDays").doc(id).set({ id, userId: input.userId, dayKey, timeZone, eventTypes: FieldValue.arrayUnion(input.activityType), sourceIds: FieldValue.arrayUnion(input.sourceId), lastActivityAt: now, updatedAt: now }, { merge: true });
  return { recorded: true, dayKey, timeZone };
}

function dayOrdinal(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export async function checkInRewardStreak(db: Firestore, userId: string, nowDate = new Date()) {
  const [userSnap, profileSnap] = await Promise.all([db.collection("users").doc(userId).get(), db.collection("profiles").doc(userId).get()]);
  const profile = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) };
  const eligibility = isConsumerRewardsEligible(profile);
  if (!eligibility.eligible) throw new Error("REWARDS_ACCOUNT_NOT_ELIGIBLE");
  const timeZone = String(profile.timeZone ?? profile.timezone ?? "UTC");
  const dayKey = rewardDateKey(nowDate, timeZone);
  const now = nowDate.toISOString();
  return db.runTransaction(async (transaction) => {
    const activityRef = db.collection("rewardActivityDays").doc(deterministicId("reward_activity", userId, dayKey));
    const streakRef = db.collection("rewardStreaks").doc(userId);
    const checkInRef = db.collection("rewardStreakCheckIns").doc(deterministicId("reward_check_in", userId, dayKey));
    const accountRef = db.collection("rewardAccounts").doc(userId);
    const [activitySnap, streakSnap, checkInSnap, accountSnap] = await Promise.all([transaction.get(activityRef), transaction.get(streakRef), transaction.get(checkInRef), transaction.get(accountRef)]);
    if (!activitySnap.exists) throw new Error("MEANINGFUL_ACTIVITY_REQUIRED");
    if (checkInSnap.exists) return { checkedIn: true, duplicate: true, dayKey, currentStreak: amount(streakSnap.data()?.currentStreak), pointsAwarded: 0 };
    const streak = streakSnap.data() ?? {};
    const previousDay = String(streak.lastCheckInDay ?? "");
    const consecutive = previousDay && dayOrdinal(dayKey) - dayOrdinal(previousDay) === 1;
    const currentStreak = consecutive ? amount(streak.currentStreak) + 1 : 1;
    const milestone = STREAK_MILESTONES.find((item) => item.days === currentStreak) ?? null;
    const milestoneRef = milestone ? db.collection("rewardAchievements").doc(deterministicId("reward_streak_milestone", userId, milestone.days)) : null;
    const milestoneSnap = milestoneRef ? await transaction.get(milestoneRef) : null;
    const pointsAwarded = milestone && !milestoneSnap?.exists ? milestone.points : 0;
    const account = accountSnap.data() ?? {};
    const previousBalance = amount(account.availablePoints);
    const previousDebt = amount(account.rewardDebt);
    const debtPaid = Math.min(previousDebt, pointsAwarded);
    const spendable = pointsAwarded - debtPaid;
    transaction.create(checkInRef, { id: checkInRef.id, userId, dayKey, timeZone, pointsAwarded: 0, milestonePointsAwarded: pointsAwarded, createdAt: now });
    transaction.set(streakRef, { userId, currentStreak, longestStreak: Math.max(currentStreak, amount(streak.longestStreak)), lastCheckInDay: dayKey, lastCheckInAt: now, timeZone, updatedAt: now, createdAt: streak.createdAt ?? now }, { merge: true });
    if (milestone && !milestoneSnap?.exists && milestoneRef) {
      transaction.create(milestoneRef, { id: milestoneRef.id, userId, achievementId: `${milestone.days}-day-streak`, status: "earned", pointsAwarded, badgeId: milestone.badgeId, earnedAt: now, createdAt: now });
      writeLedger(transaction, db, { id: deterministicId("reward_ledger", milestoneRef.id), userId, direction: "credit", amount: pointsAwarded, sourceType: "streak_milestone", sourceId: String(milestone.days), sourceEventKey: `streak-milestone:${milestone.days}:${userId}`, description: `${milestone.days}-day streak milestone.`, createdAt: now });
      if (milestone.badgeId) {
        const badge = badgePayload(userId, milestone.badgeId, "streak_milestone", String(milestone.days), now);
        transaction.set(db.collection("userBadges").doc(badge.id), badge, { merge: true });
      }
      transaction.set(accountRef, { userId, availablePoints: previousBalance + spendable, lifetimeEarned: amount(account.lifetimeEarned) + pointsAwarded, rewardDebt: previousDebt - debtPaid, updatedAt: now, createdAt: account.createdAt ?? now }, { merge: true });
      transaction.set(db.collection("userRewards").doc(userId), { availableRewardPoints: previousBalance + spendable, rewardDebt: previousDebt - debtPaid, updatedAt: now }, { merge: true });
      transaction.set(db.collection("users").doc(userId), { voterPoints: previousBalance + spendable, updatedAt: now }, { merge: true });
    }
    return { checkedIn: true, duplicate: false, dayKey, currentStreak, checkInPointsAwarded: 0, milestonePointsAwarded: pointsAwarded, badgeId: milestone && !milestoneSnap?.exists ? milestone.badgeId : null };
  });
}

export function entitlementExpiry(type: RewardEntitlementType, now = new Date()) {
  if (type === "badge") return null;
  const days = type === "creator_boost" ? 60 : 30;
  return new Date(now.getTime() + days * 86400000).toISOString();
}

export function rewardEntitlementPayload(input: { id: string; userId: string; type: RewardEntitlementType; sourceId: string; value?: number; unit?: string; tier?: string; metadata?: Record<string, unknown>; now: string }) {
  return { id: input.id, userId: input.userId, type: input.type, sourceType: "reward", sourceId: input.sourceId, value: amount(input.value), unit: input.unit ?? null, tier: input.tier ?? null, status: "available", reservationId: null, reservedUntil: null, consumedAt: null, expiresAt: entitlementExpiry(input.type, new Date(input.now)), metadata: input.metadata ?? {}, transferable: false, withdrawable: false, cashOutEnabled: false, createdAt: input.now, updatedAt: input.now };
}

export function calculateEntryEntitlement(input: { type: RewardEntitlementType; value: number; feeCents: number; maximumFeeCents?: number | null }) {
  const fee = amount(input.feeCents);
  const value = amount(input.value);
  if (input.type === "free_entry") return fee <= amount(input.maximumFeeCents ?? value) ? { eligible: true, discountCents: fee, payableCents: 0 } : { eligible: false, discountCents: 0, payableCents: fee };
  if (input.type === "fixed_entry_discount") { const discountCents = Math.min(value, fee); return { eligible: true, discountCents, payableCents: fee - discountCents }; }
  if (input.type === "percentage_entry_discount") { const discountCents = Math.min(fee, Math.floor(fee * Math.min(100, value) / 100)); return { eligible: true, discountCents, payableCents: fee - discountCents }; }
  return { eligible: false, discountCents: 0, payableCents: fee };
}

export async function reserveEntryEntitlement(db: Firestore, input: { userId: string; entitlementId: string; checkoutId: string; feeCents: number; now?: string }) {
  const now = input.now ?? new Date().toISOString();
  const reservedUntil = new Date(new Date(now).getTime() + 20 * 60_000).toISOString();
  const ref = db.collection("rewardEntitlements").doc(input.entitlementId);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error("REWARD_ENTITLEMENT_NOT_FOUND");
    const row = snap.data() ?? {};
    if (row.userId !== input.userId) throw new Error("REWARD_ENTITLEMENT_FORBIDDEN");
    const currentReservationActive = row.status === "reserved" && Date.parse(String(row.reservedUntil ?? "")) > Date.parse(now);
    if (currentReservationActive && row.reservationId !== input.checkoutId) throw new Error("REWARD_ENTITLEMENT_ALREADY_RESERVED");
    if (!currentReservationActive && !["available", "reserved"].includes(String(row.status))) throw new Error("REWARD_ENTITLEMENT_UNAVAILABLE");
    if (row.expiresAt && Date.parse(String(row.expiresAt)) <= Date.parse(now)) throw new Error("REWARD_ENTITLEMENT_EXPIRED");
    const calculation = calculateEntryEntitlement({ type: row.type as RewardEntitlementType, value: amount(row.value), feeCents: input.feeCents, maximumFeeCents: amount(row.maximumFeeCents ?? row.value) });
    if (!calculation.eligible) throw new Error("REWARD_ENTITLEMENT_NOT_ELIGIBLE");
    transaction.set(ref, { status: "reserved", reservationId: input.checkoutId, reservedUntil, updatedAt: now }, { merge: true });
    return { entitlementId: ref.id, type: row.type, value: amount(row.value), maximumFeeCents: amount(row.maximumFeeCents ?? row.value), ...calculation, reservedUntil };
  });
}

export async function releaseEntryEntitlementReservation(db: Firestore, input: { entitlementId: string; checkoutId: string; now?: string }) {
  const now = input.now ?? new Date().toISOString();
  const ref = db.collection("rewardEntitlements").doc(input.entitlementId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data()?.reservationId !== input.checkoutId || snap.data()?.status !== "reserved") return;
    transaction.set(ref, { status: "available", reservationId: null, reservedUntil: null, updatedAt: now }, { merge: true });
  });
}

export async function consumeEntryEntitlement(transaction: Transaction, db: Firestore, input: { entitlementId: string; checkoutId: string; paymentId: string; now: string }) {
  const ref = db.collection("rewardEntitlements").doc(input.entitlementId);
  const snap = await transaction.get(ref);
  if (!snap.exists || snap.data()?.status !== "reserved" || snap.data()?.reservationId !== input.checkoutId) throw new Error("REWARD_ENTITLEMENT_RESERVATION_INVALID");
  transaction.set(ref, { status: "consumed", consumedAt: input.now, consumedByPaymentId: input.paymentId, reservationId: null, reservedUntil: null, updatedAt: input.now }, { merge: true });
}

export async function adjustRewardPoints(db: Firestore, input: { userId: string; adminId: string; direction: "credit" | "debit"; amount: number; reason: string; confirmation: string; idempotencyKey: string }) {
  const value = amount(input.amount);
  if (!value || input.reason.trim().length < 8) throw new Error("REWARD_ADJUSTMENT_INVALID");
  if (input.direction === "credit" && input.confirmation !== "CONFIRM REWARD CREDIT") throw new Error("REWARD_CREDIT_CONFIRMATION_REQUIRED");
  if (input.direction === "debit" && input.confirmation !== "CONFIRM REWARD DEBIT") throw new Error("REWARD_DEBIT_CONFIRMATION_REQUIRED");
  const id = deterministicId("reward_adjustment", input.userId, input.idempotencyKey);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const ledgerRef = db.collection("rewardLedgerEntries").doc(id);
    const accountRef = db.collection("rewardAccounts").doc(input.userId);
    const [ledgerSnap, accountSnap] = await Promise.all([transaction.get(ledgerRef), transaction.get(accountRef)]);
    if (ledgerSnap.exists) return { idempotent: true, adjustment: ledgerSnap.data() };
    const account = accountSnap.data() ?? {};
    const before = amount(account.availablePoints);
    if (input.direction === "debit" && before < value) throw new Error("REWARD_DEBIT_EXCEEDS_SPENDABLE_BALANCE");
    const after = input.direction === "credit" ? before + value : before - value;
    writeLedger(transaction, db, { id, userId: input.userId, direction: input.direction, amount: value, sourceType: "admin_adjustment", sourceId: input.adminId, sourceEventKey: `admin-adjustment:${input.idempotencyKey}`, description: input.reason.trim().slice(0, 500), metadata: { adminId: input.adminId, before, after }, createdAt: now });
    transaction.set(accountRef, { userId: input.userId, availablePoints: after, lifetimeEarned: amount(account.lifetimeEarned) + (input.direction === "credit" ? value : 0), updatedAt: now, createdAt: account.createdAt ?? now }, { merge: true });
    transaction.set(db.collection("userRewards").doc(input.userId), { availableRewardPoints: after, updatedAt: now }, { merge: true });
    transaction.set(db.collection("users").doc(input.userId), { voterPoints: after, updatedAt: now }, { merge: true });
    const auditId = deterministicId("reward_adjustment_audit", id);
    transaction.create(db.collection("rewardAuditLogs").doc(auditId), { id: auditId, action: "reward_points_adjusted", userId: input.userId, adminId: input.adminId, direction: input.direction, amount: value, reason: input.reason.trim().slice(0, 500), ledgerEntryId: id, createdAt: now });
    return { idempotent: false, adjustment: { id, before, after, direction: input.direction, amount: value } };
  });
}

export async function reverseRewardEvent(db: Firestore, input: { eventId: string; actorId: string; reason: string }) {
  const now = new Date().toISOString();
  const reversalId = deterministicId("reward_reversal", input.eventId);
  return db.runTransaction(async (transaction) => {
    const eventRef = db.collection("rewardEvents").doc(input.eventId);
    const reversalRef = db.collection("rewardReversals").doc(reversalId);
    const [eventSnap, reversalSnap] = await Promise.all([transaction.get(eventRef), transaction.get(reversalRef)]);
    if (reversalSnap.exists) return { idempotent: true, reversal: reversalSnap.data() };
    if (!eventSnap.exists) throw new Error("REWARD_EVENT_NOT_FOUND");
    const event = eventSnap.data() ?? {};
    const userId = String(event.userId ?? "");
    const value = amount(event.pointsAwarded);
    const accountRef = db.collection("rewardAccounts").doc(userId);
    const accountSnap = await transaction.get(accountRef);
    const account = accountSnap.data() ?? {};
    const before = amount(account.availablePoints);
    const deducted = Math.min(before, value);
    const debtCreated = value - deducted;
    const ledgerId = deterministicId("reward_ledger", reversalId);
    writeLedger(transaction, db, { id: ledgerId, userId, direction: "debit", amount: value, sourceType: "reward_reversal", sourceId: input.eventId, sourceEventKey: `reversal:${input.eventId}`, description: input.reason.trim().slice(0, 500), metadata: { deducted, debtCreated }, createdAt: now });
    transaction.set(accountRef, { availablePoints: before - deducted, rewardDebt: amount(account.rewardDebt) + debtCreated, updatedAt: now }, { merge: true });
    transaction.set(db.collection("userRewards").doc(userId), { availableRewardPoints: before - deducted, rewardDebt: amount(account.rewardDebt) + debtCreated, updatedAt: now }, { merge: true });
    transaction.set(db.collection("users").doc(userId), { voterPoints: before - deducted, updatedAt: now }, { merge: true });
    transaction.set(eventRef, { status: "reversed", reversedAt: now, reversalId, updatedAt: now }, { merge: true });
    transaction.create(reversalRef, { id: reversalId, eventId: input.eventId, userId, amount: value, deducted, debtCreated, actorId: input.actorId, reason: input.reason.trim().slice(0, 500), ledgerEntryId: ledgerId, createdAt: now });
    return { idempotent: false, reversal: { id: reversalId, amount: value, deducted, debtCreated } };
  });
}
