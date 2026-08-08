import type { Firestore } from "firebase-admin/firestore";
import { canVoteOnChallenge } from "@/lib/challenge-status";
import { getVoteWeight } from "@/lib/plan-access";
import { canSubmissionReceiveVotes, isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { writeAuditLog } from "@/lib/server/audit";
import { deterministicId } from "@/lib/server/idempotency";
import { VOTER_REWARD_TIERS } from "@/lib/server/revenue-sharing";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { calculatePaidVoteCost, ECONOMY_V1_RULES, getActiveEconomyRules } from "@/lib/server/economy-rules";

export type VoteMode = "free" | "credits";
export const CHALLENGE_CREDIT_COST_PER_VOTE = 10;
export const MAX_PAID_VOTES_PER_DAY = 10;

export interface CastVoteInput {
  userId: string;
  challengeId: string;
  submissionId: string;
  voteMode: VoteMode;
  quantity: number;
  planId?: string;
  dailyFreeVoteLimit?: number;
  profile?: Record<string, unknown>;
  ipHash?: string | null;
  userAgentHash?: string | null;
  suspiciousSignals?: string[];
  requestIdempotencyKey?: string | null;
  timeZone?: string | null;
  confirmedLargeSpend?: boolean;
}

export function validVotingTimeZone(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

export function voteDateKeyForTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validVotingTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(number("year"), number("month") - 1, number("day"), number("hour"), number("minute"), number("second")) - date.getTime();
}

export function nextVoteResetAt(date: Date, timeZone: string) {
  const zone = validVotingTimeZone(timeZone);
  const [year, month, day] = voteDateKeyForTimeZone(date, zone).split("-").map(Number);
  const localNextMidnight = Date.UTC(year, month - 1, day + 1);
  let instant = new Date(localNextMidnight - timeZoneOffsetMs(new Date(localNextMidnight), zone));
  instant = new Date(localNextMidnight - timeZoneOffsetMs(instant, zone));
  return instant.toISOString();
}

export function freeVoteGuardId(userId: string, challengeId: string, voteDate: string) {
  return deterministicId("free_vote", userId, challengeId, voteDate);
}

function votingSettings(challenge: Record<string, unknown>) {
  const settings = typeof challenge.votingSettings === "object" && challenge.votingSettings !== null
    ? challenge.votingSettings as Record<string, unknown>
    : {};
  return {
    allowFreeVotes: settings.allowFreeVotes !== false,
    allowPaidVotes: settings.allowPaidVotes === undefined ? settings.allowDoroCoinVotes !== false : settings.allowPaidVotes !== false,
    weightedVotes: settings.weightedVotes !== false
  };
}

function voteReject(message: string, code: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

export async function castVote(db: Firestore, input: CastVoteInput) {
  const economyRules = await getActiveEconomyRules(db);
  const paidVoteDailyLimit = economyRules.voting.paidVoteDailyLimit;
  const paidVoteCostCredits = economyRules.voting.paidVoteCostCredits;
  const quantity = Math.max(1, Math.trunc(input.quantity || 1));
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const voteTimeZone = validVotingTimeZone(input.timeZone);
  const voteDateKey = voteDateKeyForTimeZone(nowDate, voteTimeZone);
  const freeVoteResetAt = nextVoteResetAt(nowDate, voteTimeZone);
  const profile = { ...(input.profile ?? {}), planId: input.planId ?? input.profile?.planId ?? "free" };
  const voteRequestId = input.requestIdempotencyKey
    ? deterministicId("vote_request", input.userId, input.challengeId, input.submissionId, input.voteMode, input.requestIdempotencyKey)
    : null;

  if (isSponsorProfile(profile)) {
    throw voteReject("Sponsor accounts cannot vote in normal user challenges yet.", "SPONSOR_ACCOUNT_BLOCKED");
  }
  if (input.voteMode === "free" && quantity !== 1) {
    throw voteReject("Free votes must be submitted one at a time.", "INVALID_FREE_VOTE_QUANTITY");
  }
  if (input.voteMode === "credits" && quantity > paidVoteDailyLimit) {
    throw voteReject(`You can cast up to ${paidVoteDailyLimit} additional votes per challenge each day.`, "PAID_VOTE_DAILY_LIMIT");
  }
  if (input.voteMode === "credits" && !input.requestIdempotencyKey) {
    throw voteReject("An idempotency key is required for Challenge Credit voting.", "IDEMPOTENCY_KEY_REQUIRED");
  }

  const result = await db.runTransaction(async (transaction) => {
    const challengeRef = db.collection("challenges").doc(input.challengeId);
    const submissionRef = db.collection("submissions").doc(input.submissionId);
    const leaderboardRef = db.collection("leaderboards").doc(input.challengeId);
    const voteRequestRef = voteRequestId ? db.collection("voteRequests").doc(voteRequestId) : null;
    const freeVoteGuardRef = input.voteMode === "free"
      ? db.collection("freeVoteDailyGuards").doc(freeVoteGuardId(input.userId, input.challengeId, voteDateKey))
      : null;
    const paidVoteGuardRef = input.voteMode === "credits"
      ? db.collection("paidVoteDailyGuards").doc(deterministicId("paid_vote", input.userId, input.challengeId, voteDateKey))
      : null;
    const [challengeSnap, submissionSnap, leaderboardSnap, voteRequestSnap, freeVoteGuardSnap, paidVoteGuardSnap] = await Promise.all([
      transaction.get(challengeRef),
      transaction.get(submissionRef),
      transaction.get(leaderboardRef),
      voteRequestRef ? transaction.get(voteRequestRef) : Promise.resolve(null),
      freeVoteGuardRef ? transaction.get(freeVoteGuardRef) : Promise.resolve(null),
      paidVoteGuardRef ? transaction.get(paidVoteGuardRef) : Promise.resolve(null)
    ]);

    if (voteRequestSnap?.exists) {
      return voteRequestSnap.data()?.result as {
        votes: Record<string, unknown>[];
        vote: Record<string, unknown>;
        quantity: number;
        voteWeight: number;
        weightedVoteCount: number;
        coinCost: number;
        creditCost: number;
        walletTransactionId: string | null;
        suspiciousSignals: string[];
        voteDate?: string;
        timeZone?: string;
        freeVoteResetAt?: string;
        idempotentReplay?: boolean;
      };
    }

    if (!challengeSnap.exists) throw voteReject("Challenge not found.", "NOT_FOUND");
    const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
    if (!canVoteOnChallenge(challenge)) throw voteReject("Voting is closed for this challenge.", "VOTING_CLOSED");
    if (userOwnsChallenge(challenge, input.userId)) {
      throw voteReject("You cannot vote on your own challenge.", "CHALLENGE_OWNER_VOTING_BLOCKED");
    }

    const settings = votingSettings(challenge);
    if (input.voteMode === "credits" && (!economyRules.voting.paidVotingEnabled || challenge.paidVotingDisabledByAdmin === true)) throw voteReject("Additional Challenge Credit voting is disabled.", "PAID_VOTING_DISABLED");
    if (input.voteMode === "free" && !settings.allowFreeVotes) throw voteReject("Free voting is not enabled for this challenge.", "FREE_VOTING_DISABLED");
    if (input.voteMode === "credits" && (!settings.allowPaidVotes || !ECONOMY_V1_RULES.voting.paidVotingEnabled)) throw voteReject("Additional voting is not enabled for this challenge.", "PAID_VOTING_DISABLED");

    if (!submissionSnap.exists) throw voteReject("Submission not found.", "NOT_FOUND");
    const submission = { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown>;
    if (submission.challengeId !== input.challengeId) throw voteReject("Submission does not belong to this challenge.", "SUBMISSION_CHALLENGE_MISMATCH");
    if (String(submission.userId ?? "") === input.userId) throw voteReject("You cannot vote for your own submission.", "SELF_VOTING_NOT_ALLOWED");
    if (!canSubmissionReceiveVotes(submission.status)) {
      throw voteReject("This submission is not eligible for voting.", "SUBMISSION_NOT_VOTABLE");
    }

    if (input.voteMode === "free" && freeVoteGuardSnap?.exists) {
      throw voteReject(
        "You have used your free vote for this challenge today.",
        "FREE_CHALLENGE_DAILY_LIMIT_REACHED"
      );
    }

    let walletTransactionId: string | null = null;
    let coinCost = 0;
    let creditCost = 0;
    if (input.voteMode === "credits") {
      const alreadyUsed = Number(paidVoteGuardSnap?.data()?.quantity ?? 0);
      if (alreadyUsed + quantity > paidVoteDailyLimit) throw voteReject(`You can cast up to ${paidVoteDailyLimit} additional votes per challenge each day.`, "PAID_VOTE_DAILY_LIMIT");
      creditCost = calculatePaidVoteCost(quantity, economyRules);
      const walletRef = db.collection("challengeCreditWallets").doc(input.userId);
      const walletSnap = await transaction.get(walletRef);
      const balance = Number(walletSnap.data()?.balance ?? 0);
      if (balance < creditCost) throw voteReject(`Insufficient Challenge Credits. ${paidVoteCostCredits} Credits equals 1 additional vote.`, "INSUFFICIENT_CHALLENGE_CREDITS");
      transaction.set(walletRef, { userId: input.userId, balance: balance - creditCost, withdrawable: false, updatedAt: now }, { merge: true });
      const txnRef = voteRequestId
        ? db.collection("challengeCreditTransactions").doc(deterministicId("vote", voteRequestId, "credit_spend"))
        : db.collection("challengeCreditTransactions").doc();
      walletTransactionId = txnRef.id;
      transaction.set(txnRef, {
        id: txnRef.id,
        userId: input.userId,
        category: "challenge_credit",
        amount: creditCost,
        signedAmount: -creditCost,
        direction: "debit",
        balanceBefore: balance,
        balanceAfter: balance - creditCost,
        type: "paid_vote_spend",
        sourceType: "paid_vote_spend",
        description: `${quantity} vote${quantity === 1 ? "" : "s"} on submission ${input.submissionId}`,
        sourceId: input.submissionId,
        challengeId: input.challengeId,
        idempotencyKey: voteRequestId,
        immutable: true,
        cashOutEnabled: false,
        withdrawable: false,
        ruleVersion: economyRules.version,
        createdBy: input.userId,
        createdAt: now
      });
      transaction.set(paidVoteGuardRef!, { userId: input.userId, challengeId: input.challengeId, voteDate: voteDateKey, timeZone: voteTimeZone, quantity: alreadyUsed + quantity, maximum: paidVoteDailyLimit, updatedAt: now }, { merge: true });
      const holdRef = db.collection("paidVoteEconomyHolds").doc(deterministicId("credit_votes", voteRequestId ?? `${input.userId}_${input.challengeId}_${input.submissionId}_${voteDateKey}`));
      transaction.set(holdRef, { id: holdRef.id, userId: input.userId, challengeId: input.challengeId, submissionId: input.submissionId, quantity, challengeCreditsSpent: creditCost, status: "held_pending_challenge_completion", releaseRequiresChallengeCompletion: true, releaseRequiresFraudClearance: true, releaseRequiresDisputeClearance: true, releaseRequiresVoteIntegrityClearance: true, cashEquivalentAmountCents: null, distributionStatus: "awaiting_confirmed_rule_and_value_attribution", ruleVersion: economyRules.version, createdAt: now, updatedAt: now }, { merge: true });
    }

    const voteWeight = getVoteWeight(profile, settings.weightedVotes);
    const voteRecords: Record<string, unknown>[] = [];
    for (let index = 0; index < quantity; index += 1) {
      const voteRef = voteRequestId
        ? db.collection("votes").doc(deterministicId("vote", voteRequestId, index))
        : db.collection("votes").doc();
      const vote = {
        id: voteRef.id,
        category: "vote",
        challengeId: input.challengeId,
        submissionId: input.submissionId,
        voterId: input.userId,
        userId: input.userId,
        submissionOwnerId: submission.userId ?? null,
        voteType: input.voteMode,
        voteMode: input.voteMode,
        voteWeight,
        weight: voteWeight,
        coinCost: 0,
        creditCost: input.voteMode === "credits" ? paidVoteCostCredits : 0,
        ruleVersion: economyRules.version,
        planId: profile.planId ?? input.planId ?? "free",
        voteDateKey,
        voteDate: voteDateKey,
        timeZone: voteTimeZone,
        status: "counted",
        walletTransactionId,
        requestIdempotencyKey: voteRequestId,
        idempotencyKey: voteRequestId ?? voteRef.id,
        immutable: true,
        ipHash: input.ipHash ?? null,
        userAgentHash: input.userAgentHash ?? null,
        createdAt: now
      };
      transaction.set(voteRef, vote);
      voteRecords.push(vote);
    }

    if (freeVoteGuardRef) {
      transaction.create(freeVoteGuardRef, {
        id: freeVoteGuardRef.id,
        userId: input.userId,
        challengeId: input.challengeId,
        submissionId: input.submissionId,
        voteDate: voteDateKey,
        timeZone: voteTimeZone,
        resetsAt: freeVoteResetAt,
        consumedAt: now,
        eligibility: "eligible",
        voteMode: "free",
        createdAt: now
      });
    }

    const weightedIncrement = voteWeight * quantity;
    transaction.set(submissionRef, {
      voteCount: Number(submission.voteCount ?? 0) + quantity,
      weightedVoteCount: Number(submission.weightedVoteCount ?? 0) + weightedIncrement,
      updatedAt: now
    }, { merge: true });

    transaction.set(challengeRef, {
      voteCount: Number(challenge.voteCount ?? 0) + quantity,
      weightedVoteCount: Number(challenge.weightedVoteCount ?? 0) + weightedIncrement,
      updatedAt: now
    }, { merge: true });

    transaction.set(leaderboardRef, {
      id: input.challengeId,
      challengeId: input.challengeId,
      totalVotes: Number(leaderboardSnap.data()?.totalVotes ?? 0) + quantity,
      weightedVoteCount: Number(leaderboardSnap.data()?.weightedVoteCount ?? 0) + weightedIncrement,
      lastVoteAt: now,
      updatedAt: now
    }, { merge: true });

    const voteResult = {
      votes: voteRecords,
      vote: voteRecords[0],
      quantity,
      voteWeight,
      weightedVoteCount: weightedIncrement,
      coinCost,
      creditCost,
      walletTransactionId,
      suspiciousSignals: input.suspiciousSignals ?? [],
      voteDate: voteDateKey,
      timeZone: voteTimeZone,
      freeVoteResetAt,
      idempotentReplay: false
    };

    if (voteRequestRef) {
      transaction.set(voteRequestRef, {
        id: voteRequestRef.id,
        userId: input.userId,
        challengeId: input.challengeId,
        submissionId: input.submissionId,
        voteMode: input.voteMode,
        quantity,
        status: "processed",
        result: voteResult,
        createdAt: now,
        updatedAt: now
      });
    }

    return voteResult;
  });

  void writeAuditLog({
    actorId: input.userId,
    actorType: "user",
    action: input.suspiciousSignals?.length ? "vote.suspicious_activity" : "vote.recorded",
    targetType: "vote",
    targetId: String(result.vote?.id ?? input.submissionId),
    after: {
      challengeId: input.challengeId,
      submissionId: input.submissionId,
      voteMode: input.voteMode,
      quantity,
      coinCost: result.coinCost,
      creditCost: result.creditCost,
      voteWeight: result.voteWeight,
      suspiciousSignals: input.suspiciousSignals ?? [],
      idempotentReplay: Boolean(result.idempotentReplay)
    },
    metadata: {
      challengeId: input.challengeId,
      submissionId: input.submissionId,
      quantity,
      requestIdempotencyKey: voteRequestId,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null
    }
  }, db).catch((error) => console.warn("[audit] vote audit failed", { challengeId: input.challengeId, submissionId: input.submissionId, error: error instanceof Error ? error.message : "unknown" }));

  return result;
}



