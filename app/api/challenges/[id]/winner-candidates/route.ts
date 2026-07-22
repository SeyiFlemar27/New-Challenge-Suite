import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { canProposeChallengeWinners, getChallengeOrNull, getWinnerCandidates, winnerProposalLifecycleReadiness } from "@/lib/server/prize-approvals";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner candidates");
  const { id: challengeId } = await params;
  const challenge = await getChallengeOrNull(db, challengeId);
  if (!challenge) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const access = canProposeChallengeWinners(user, challenge);
  if (!access.allowed) return fail(access.reason, 403, { reason: access.reason }, "WINNER_CANDIDATES_FORBIDDEN");

  const [candidates, proposalsSnap] = await Promise.all([
    getWinnerCandidates(db, challengeId),
    db.collection("winnerProposals").where("challengeId", "==", challengeId).limit(25).get()
  ]);
  const proposals: Array<Record<string, unknown> & { id: string }> = proposalsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const blockingStatuses = new Set(["pending_admin_review", "approved"]);
  const activeProposal = proposals.find((proposal) => blockingStatuses.has(String(proposal.status ?? "")));
  return ok({
    challenge: {
      id: challenge.id,
      title: challenge.title ?? "",
      status: challenge.status ?? challenge.lifecycleStatus ?? "draft",
      lifecycleStatus: challenge.lifecycleStatus ?? challenge.status ?? "draft",
      participantCount: Number(challenge.participantCount ?? challenge.participants ?? 0),
      submissionCount: Number(challenge.submissionCount ?? 0),
      votingDeadline: challenge.votingDeadline ?? challenge.votingEndsAt ?? null
    },
    readiness: winnerProposalLifecycleReadiness(challenge),
    candidates,
    proposals,
    activeProposal: activeProposal ?? null,
    candidateSource: "submissions",
    noEligibleCandidatesMessage: candidates.length ? null : "No eligible submissions yet."
  }, "Winner candidates loaded.");
}
