import type { Firestore } from "firebase-admin/firestore";
import { todayKey } from "@/lib/utils";
import { canVoteOnChallenge } from "@/lib/challenge-status";
import { getVoteWeight } from "@/lib/plan-access";
import { canSubmissionReceiveVotes, isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { writeAuditLog } from "@/lib/server/audit";
import { deterministicId } from "@/lib/server/idempotency";

export type VoteMode = "free" | "dorocoin";

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
}

function votingSettings(challenge: Record<string, unknown>) {
  const settings = typeof challenge.votingSettings === "object" && challenge.votingSettings !== null
    ? challenge.votingSettings as Record<string, unknown>
    : {};
  return {
    allowFreeVotes: settings.allowFreeVotes !== false,
    allowDoroCoinVotes: settings.allowDoroCoinVotes !== false,
    weightedVotes: settings.weightedVotes !== false
  };
}

function voteReject(message: string, code: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

export async function castVote(db: Firestore, input: CastVoteInput) {
  const quantity = Math.max(1, Math.trunc(input.quantity || 1));
  const now = new Date().toISOString();
  const voteDateKey = todayKey();
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

  const result = await db.runTransaction(async (transaction) => {
    const challengeRef = db.collection("challenges").doc(input.challengeId);
    const submissionRef = db.collection("submissions").doc(input.submissionId);
    const leaderboardRef = db.collection("leaderboards").doc(input.challengeId);
    const voteRequestRef = voteRequestId ? db.collection("voteRequests").doc(voteRequestId) : null;
    const [challengeSnap, submissionSnap, leaderboardSnap, voteRequestSnap] = await Promise.all([
      transaction.get(challengeRef),
      transaction.get(submissionRef),
      transaction.get(leaderboardRef),
      voteRequestRef ? transaction.get(voteRequestRef) : Promise.resolve(null)
    ]);

    if (voteRequestSnap?.exists) {
      return voteRequestSnap.data()?.result as {
        votes: Record<string, unknown>[];
        vote: Record<string, unknown>;
        quantity: number;
        voteWeight: number;
        weightedVoteCount: number;
        coinCost: number;
        walletTransactionId: string | null;
        suspiciousSignals: string[];
        idempotentReplay?: boolean;
      };
    }

    if (!challengeSnap.exists) throw voteReject("Challenge not found.", "NOT_FOUND");
    const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
    if (!canVoteOnChallenge(challenge)) throw voteReject("Voting is closed for this challenge.", "VOTING_CLOSED");

    const settings = votingSettings(challenge);
    if (input.voteMode === "free" && !settings.allowFreeVotes) throw voteReject("Free voting is not enabled for this challenge.", "FREE_VOTING_DISABLED");
    if (input.voteMode === "dorocoin" && !settings.allowDoroCoinVotes) throw voteReject("DoroCoin voting is not enabled for this challenge.", "DOROCOIN_VOTING_DISABLED");

    if (!submissionSnap.exists) throw voteReject("Submission not found.", "NOT_FOUND");
    const submission = { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown>;
    if (submission.challengeId !== input.challengeId) throw voteReject("Submission does not belong to this challenge.", "SUBMISSION_CHALLENGE_MISMATCH");
    if (!canSubmissionReceiveVotes(submission.status)) {
      throw voteReject("This submission is not eligible for voting.", "SUBMISSION_NOT_VOTABLE");
    }

    if (input.voteMode === "free") {
      const dailyVoteLimit = Number(input.dailyFreeVoteLimit ?? 1);
      const freeVoteQuery = db.collection("votes")
        .where("userId", "==", input.userId)
        .where("challengeId", "==", input.challengeId)
        .where("voteDate", "==", voteDateKey)
        .where("voteMode", "==", "free")
        .limit(Math.max(dailyVoteLimit, 1));
      const existing = await transaction.get(freeVoteQuery);
      if (existing.size >= dailyVoteLimit) {
        throw voteReject(
          `Free vote limit reached for this challenge today. Your plan includes ${dailyVoteLimit} free vote${dailyVoteLimit === 1 ? "" : "s"} per challenge/day.`,
          "FREE_CHALLENGE_DAILY_LIMIT_REACHED"
        );
      }
    }

    let walletTransactionId: string | null = null;
    let coinCost = 0;
    if (input.voteMode === "dorocoin") {
      coinCost = quantity;
      const walletRef = db.collection("doroCoinWallets").doc(input.userId);
      const walletSnap = await transaction.get(walletRef);
      const balance = Number(walletSnap.data()?.balance ?? 0);
      if (balance < coinCost) throw voteReject("Insufficient DoroCoins. 1 DoroCoin equals 1 vote.", "INSUFFICIENT_DOROCOINS");
      transaction.set(walletRef, { userId: input.userId, balance: balance - coinCost, lockedBalance: Number(walletSnap.data()?.lockedBalance ?? 0), updatedAt: now }, { merge: true });
      const txnRef = voteRequestId
        ? db.collection("doroCoinTransactions").doc(deterministicId("vote", voteRequestId, "dorocoin_spend"))
        : db.collection("doroCoinTransactions").doc();
      walletTransactionId = txnRef.id;
      transaction.set(txnRef, {
        id: txnRef.id,
        userId: input.userId,
        amount: -coinCost,
        balanceAfter: balance - coinCost,
        type: "vote_spend",
        description: `${quantity} vote${quantity === 1 ? "" : "s"} on submission ${input.submissionId}`,
        sourceId: input.submissionId,
        challengeId: input.challengeId,
        idempotencyKey: voteRequestId,
        createdBy: input.userId,
        createdAt: now
      });
    }

    const voteWeight = getVoteWeight(profile, settings.weightedVotes);
    const voteRecords: Record<string, unknown>[] = [];
    for (let index = 0; index < quantity; index += 1) {
      const voteRef = voteRequestId
        ? db.collection("votes").doc(deterministicId("vote", voteRequestId, index))
        : db.collection("votes").doc();
      const vote = {
        id: voteRef.id,
        challengeId: input.challengeId,
        submissionId: input.submissionId,
        voterId: input.userId,
        userId: input.userId,
        submissionOwnerId: submission.userId ?? null,
        voteType: input.voteMode,
        voteMode: input.voteMode,
        voteWeight,
        weight: voteWeight,
        coinCost: input.voteMode === "dorocoin" ? 1 : 0,
        planId: profile.planId ?? input.planId ?? "free",
        voteDateKey,
        voteDate: voteDateKey,
        status: "counted",
        walletTransactionId,
        requestIdempotencyKey: voteRequestId,
        ipHash: input.ipHash ?? null,
        userAgentHash: input.userAgentHash ?? null,
        createdAt: now
      };
      transaction.set(voteRef, vote);
      voteRecords.push(vote);
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
      walletTransactionId,
      suspiciousSignals: input.suspiciousSignals ?? [],
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
