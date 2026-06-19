import type { Firestore } from "firebase-admin/firestore";
import { todayKey } from "@/lib/utils";
import { canVoteOnChallenge } from "@/lib/challenge-status";

const weightByPlan: Record<string, number> = {
  observer: 1,
  creator: 1.1,
  competitor: 1.25,
  executive_host: 1.5,
  chief_producer: 2,
  brand_partner: 1,
  enterprise_sponsor: 1
};

export async function castVote(db: Firestore, input: { userId: string; challengeId: string; submissionId: string; voteMode: "free" | "dorocoin"; planId?: string }) {
  const now = new Date().toISOString();
  const voteDate = todayKey();
  const weight = weightByPlan[input.planId || "observer"] ?? 1;

  return db.runTransaction(async (transaction) => {
    const challengeRef = db.collection("challenges").doc(input.challengeId);
    const challengeSnap = await transaction.get(challengeRef);
    if (!challengeSnap.exists) throw new Error("Challenge not found.");
    const challenge = challengeSnap.data()!;
    if (!canVoteOnChallenge(challenge as any)) throw new Error("Voting is closed for this challenge.");

    const submissionRef = db.collection("submissions").doc(input.submissionId);
    const submissionSnap = await transaction.get(submissionRef);
    if (!submissionSnap.exists) throw new Error("Submission not found.");
    if (submissionSnap.data()?.challengeId !== input.challengeId) throw new Error("Submission does not belong to this challenge.");

    if (input.voteMode === "free") {
      const freeVoteQuery = db.collection("votes")
        .where("userId", "==", input.userId)
        .where("challengeId", "==", input.challengeId)
        .where("voteDate", "==", voteDate)
        .where("voteMode", "==", "free")
        .limit(1);
      const existing = await transaction.get(freeVoteQuery);
      if (!existing.empty) throw new Error("Free users get 1 vote per challenge/day.");
    }

    if (input.voteMode === "dorocoin") {
      const walletRef = db.collection("doroCoinWallets").doc(input.userId);
      const walletSnap = await transaction.get(walletRef);
      const balance = Number(walletSnap.data()?.balance ?? 0);
      if (balance < 1) throw new Error("Insufficient DoroCoins. 1 DoroCoin equals 1 vote.");
      transaction.set(walletRef, { userId: input.userId, balance: balance - 1, updatedAt: now }, { merge: true });
      const txnRef = db.collection("doroCoinTransactions").doc();
      transaction.set(txnRef, {
        id: txnRef.id,
        userId: input.userId,
        amount: -1,
        balanceAfter: balance - 1,
        type: "vote_spend",
        description: `Vote on submission ${input.submissionId}`,
        sourceId: input.submissionId,
        createdBy: input.userId,
        createdAt: now
      });
    }

    const voteRef = db.collection("votes").doc();
    const vote = {
      id: voteRef.id,
      userId: input.userId,
      challengeId: input.challengeId,
      submissionId: input.submissionId,
      voteMode: input.voteMode,
      voteDate,
      weight,
      createdAt: now
    };
    transaction.set(voteRef, vote);

    const currentVotes = Number(submissionSnap.data()?.voteCount ?? 0);
    const currentWeighted = Number(submissionSnap.data()?.weightedVoteCount ?? 0);
    transaction.set(submissionRef, {
      voteCount: currentVotes + 1,
      weightedVoteCount: currentWeighted + weight,
      updatedAt: now
    }, { merge: true });

    transaction.set(challengeRef, {
      voteCount: Number(challengeSnap.data()?.voteCount ?? 0) + 1,
      weightedVoteCount: Number(challengeSnap.data()?.weightedVoteCount ?? 0) + weight,
      updatedAt: now
    }, { merge: true });

    const leaderboardRef = db.collection("leaderboards").doc(input.challengeId);
    const leaderboardSnap = await transaction.get(leaderboardRef);
    transaction.set(leaderboardRef, {
      id: input.challengeId,
      challengeId: input.challengeId,
      totalVotes: Number(leaderboardSnap.data()?.totalVotes ?? 0) + 1,
      weightedVoteCount: Number(leaderboardSnap.data()?.weightedVoteCount ?? 0) + weight,
      lastVoteAt: now,
      updatedAt: now
    }, { merge: true });

    return vote;
  });
}
