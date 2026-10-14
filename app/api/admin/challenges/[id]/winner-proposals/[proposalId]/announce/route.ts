import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { createAuditLogRecord } from "@/lib/server/audit";
import { deterministicId } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { normalizeWinnerProposalWinners, validateWinnerProposalWinners } from "@/lib/server/prize-approvals";
import { validateAuthoritativeWinnerRecords, authoritativeWinnerCount } from "@/lib/server/official-winner-records";

function safeId(value: string) { return value.replace(/[^a-zA-Z0-9_.:-]/g, "_"); }

function dateMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date ? parsed.getTime() : Number.NaN;
  }
  return Number.NaN;
}

function eligibleSubmission(submission: Record<string, unknown>, challengeId: string, userId: string) {
  const state = String(submission.status ?? "").toLowerCase();
  const participantStatus = String(submission.participantStatus ?? submission.enrollmentStatus ?? "").toLowerCase();
  const paymentStatus = String(submission.paymentStatus ?? submission.entryPaymentStatus ?? "").toLowerCase();
  const moderationStatus = String(submission.moderationStatus ?? "").toLowerCase();
  return String(submission.challengeId ?? "") === challengeId
    && String(submission.userId ?? submission.participantUserId ?? "") === userId
    && ["approved", "active", "winner"].includes(state)
    && !["pending", "pending_review", "pending_payment", "rejected", "withdrawn", "disqualified", "incomplete"].includes(participantStatus)
    && !["pending", "pending_payment", "failed", "cancelled", "refunded", "disputed"].includes(paymentStatus)
    && !["removed", "rejected", "disqualified", "flagged"].includes(moderationStatus);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { user, response } = await requireRecentAdminAuthentication(request, "settlements.approve");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner announcement");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const reason = typeof parsed.body?.reason === "string" ? parsed.body.reason.trim().slice(0, 1000) : "";
  if (parsed.body?.confirmation !== true || !reason) return validationError({ confirmation: "Confirm the winner announcement and provide a reason." });

  const { id: challengeId, proposalId } = await params;
  const challengeRef = db.collection("challenges").doc(challengeId);
  const proposalRef = db.collection("winnerProposals").doc(proposalId);
  const [challengeSnap, proposalSnap] = await Promise.all([challengeRef.get(), proposalRef.get()]);
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  if (!proposalSnap.exists || String(proposalSnap.data()?.challengeId ?? "") !== challengeId) return fail("Winner proposal not found.", 404, undefined, "WINNER_PROPOSAL_NOT_FOUND");
  const challenge = { id: challengeId, ...challengeSnap.data() } as Record<string, unknown>;
  const proposal = proposalSnap.data() ?? {};
  if (String(proposal.status ?? "") !== "approved") return fail("An Admin-approved winner proposal is required.", 409, undefined, "WINNER_PROPOSAL_NOT_APPROVED");
  if (["cancelled", "canceled"].includes(String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase())) return fail("Cancelled challenges cannot announce winners.", 409, undefined, "CHALLENGE_CANCELLED");
  if (challenge.fraudReviewRequired === true || Number(challenge.unresolvedReportsCount ?? 0) > 0 || String(challenge.disputeStatus ?? "").toLowerCase() === "open") return fail("Winner announcement is paused while an unresolved challenge review hold exists.", 409, undefined, "WINNER_ANNOUNCEMENT_ON_HOLD");
  const announcementAt = dateMillis(challenge.winnersAnnouncedAt ?? challenge.winnerAnnouncementAt ?? challenge.winnerAnnouncementDate ?? challenge.endsAt);
  if (!Number.isFinite(announcementAt)) return fail("The challenge has no valid scheduled winner-announcement time.", 409, undefined, "WINNER_ANNOUNCEMENT_TIME_REQUIRED");
  if (Date.now() < announcementAt) return fail("The scheduled winner-announcement time has not arrived.", 409, undefined, "WINNER_ANNOUNCEMENT_NOT_DUE");

  const winners = normalizeWinnerProposalWinners(proposal.winners, challenge);
  const validation = validateWinnerProposalWinners(winners, challenge);
  if (!validation.valid) return validationError(validation.errors, "Approved winner proposal is invalid.");
  const records = winners.map((winner) => {
    const submissionId = winner.submissionId ?? "";
    return {
      id: deterministicId("official_winner", challengeId, proposalId, String(winner.placement)),
      challengeId,
      proposalId,
      userId: winner.userId,
      submissionId,
      position: winner.placement,
      rank: winner.placement,
      status: "announced"
    };
  });
  const recordValidation = validateAuthoritativeWinnerRecords(challengeId, records, challenge.builderVersion === "normal_v3" ? authoritativeWinnerCount(challenge) : undefined);
  if (!recordValidation.valid) return fail("Every winner must reference an authoritative eligible submission.", 409, undefined, "WINNER_RECORDS_INVALID");

  const settlementId = safeId(`challenge_settlement_${challengeId}_${proposalId}`);
  if ((challenge.settlementId && String(challenge.settlementId) !== settlementId)
    || (proposal.settlementId && String(proposal.settlementId) !== settlementId)) {
    return fail("The settlement does not belong to this challenge and approved proposal.", 409, undefined, "WINNER_SETTLEMENT_MISMATCH");
  }
  const settlementRef = db.collection("challengeSettlements").doc(settlementId);
  const auditRef = db.collection("auditLogs").doc();
  const winnerRefs = records.map((winner) => db.collection("winners").doc(winner.id));
  const submissionRefs = records.map((winner) => db.collection("submissions").doc(String(winner.submissionId)));

  try {
    const result = await db.runTransaction(async (transaction) => {
      const [latestChallengeSnap, latestProposalSnap, settlementSnap, ...recordAndSubmissionSnaps] = await Promise.all([
        transaction.get(challengeRef), transaction.get(proposalRef), transaction.get(settlementRef),
        ...winnerRefs.map((ref) => transaction.get(ref)), ...submissionRefs.map((ref) => transaction.get(ref))
      ]);
      if (!latestChallengeSnap.exists || !latestProposalSnap.exists) throw new Error("ANNOUNCEMENT_RECORD_MISSING");
      const latestChallenge = latestChallengeSnap.data() ?? {};
      const latestProposal = latestProposalSnap.data() ?? {};
      if (latestChallenge.normalLifecyclePolicyVersion === 1) {
        if (latestChallenge.normalOutcome === "no_winners" || latestChallenge.settlementRestricted === true) throw new Error("WINNER_ANNOUNCEMENT_ON_HOLD");
        if (authoritativeWinnerCount(latestChallenge) !== records.length || !Array.isArray(latestChallenge.approvedWinnerIds) || records.some(winner => !latestChallenge.approvedWinnerIds.includes(winner.userId))) throw new Error("WINNER_PROPOSAL_CHANGED");
        const participants = await Promise.all(records.map(winner => transaction.get(db.collection("challengeParticipants").doc(`${challengeId}_${String(winner.userId)}`))));
        const paidEntry = latestChallenge.paidEntryEnabled || (latestChallenge.monetization as Record<string, unknown> | undefined)?.paidEntryRequested;
        if (participants.some(participant => !participant.exists || !["active", "approved", "entered", "enrolled", "winner", "submitted"].includes(String(participant.data()?.status)) || participant.data()?.disqualifiedAt || (paidEntry && !["paid", "confirmed"].includes(String(participant.data()?.entryPaymentStatus))))) throw new Error("WINNER_RECORDS_INVALID");
        const effectiveEnd = dateMillis(latestChallenge.effectiveVotingEndsAt);
        if (!Number.isFinite(effectiveEnd) || Date.now() < effectiveEnd) throw new Error("WINNER_ANNOUNCEMENT_NOT_DUE");
      }
      if (["cancelled", "canceled"].includes(String(latestChallenge.status ?? latestChallenge.lifecycleStatus ?? "").toLowerCase())) throw new Error("CHALLENGE_CANCELLED");
      if (String(latestProposal.status ?? "") !== "approved") throw new Error("WINNER_PROPOSAL_NOT_APPROVED");
      if ((latestChallenge.settlementId && String(latestChallenge.settlementId) !== settlementId)
        || (latestProposal.settlementId && String(latestProposal.settlementId) !== settlementId)) throw new Error("WINNER_SETTLEMENT_MISMATCH");
      const latestWinners = normalizeWinnerProposalWinners(latestProposal.winners, latestChallenge);
      const latestValidation = validateWinnerProposalWinners(latestWinners, latestChallenge);
      if (!latestValidation.valid || latestWinners.length !== records.length || latestWinners.some((winner, index) => winner.userId !== records[index].userId || winner.placement !== records[index].position || !winner.submissionId || winner.submissionId !== records[index].submissionId)) throw new Error("WINNER_PROPOSAL_CHANGED");
      if (!settlementSnap.exists) throw new Error("WINNER_SETTLEMENT_MISSING");
      const settlement = settlementSnap.data() ?? {};
      if (String(settlement.challengeId ?? "") !== challengeId || String(settlement.proposalId ?? "") !== proposalId) throw new Error("WINNER_SETTLEMENT_MISMATCH");
      const settlementStatus = String(settlement.status ?? "").toLowerCase();
      if (settlement.disputeRestricted === true || settlementStatus.includes("disput") || settlementStatus.includes("review_required")) throw new Error("WINNER_ANNOUNCEMENT_ON_HOLD");
      if (latestChallenge.fraudReviewRequired === true || Number(latestChallenge.unresolvedReportsCount ?? 0) > 0 || String(latestChallenge.disputeStatus ?? "").toLowerCase() === "open") throw new Error("WINNER_ANNOUNCEMENT_ON_HOLD");
      const latestAnnouncementAt = dateMillis(latestChallenge.winnersAnnouncedAt ?? latestChallenge.winnerAnnouncementAt ?? latestChallenge.winnerAnnouncementDate ?? latestChallenge.endsAt);
      if (!Number.isFinite(latestAnnouncementAt) || Date.now() < latestAnnouncementAt) throw new Error("WINNER_ANNOUNCEMENT_NOT_DUE");
      if (["winners_announced", "completed"].includes(String(latestChallenge.status ?? latestChallenge.lifecycleStatus ?? "").toLowerCase())) {
        if (latestChallenge.officialWinnerRecordsValidatedAt && Number(latestChallenge.officialWinnerRecordCount) === records.length) return { alreadyAnnounced: true };
        throw new Error("OFFICIAL_WINNER_RECORDS_MISSING");
      }
      if (records.some((winner, index) => {
        const stored = recordAndSubmissionSnaps[index]?.data() ?? {};
        const submission = recordAndSubmissionSnaps[winnerRefs.length + index]?.data() ?? {};
        return !eligibleSubmission(submission, challengeId, String(winner.userId))
          || (recordAndSubmissionSnaps[index]?.exists && (String(stored.challengeId) !== challengeId || String(stored.userId) !== String(winner.userId) || String(stored.submissionId) !== String(winner.submissionId)));
      })) throw new Error("WINNER_RECORDS_INVALID");

      const now = new Date().toISOString();
      for (let index = 0; index < records.length; index += 1) {
        transaction.set(winnerRefs[index], { ...records[index], status: "announced", settlementId, announcedAt: now, createdAt: recordAndSubmissionSnaps[index]?.exists ? recordAndSubmissionSnaps[index].data()?.createdAt ?? now : now, updatedAt: now, verifiedByAdminId: user!.uid }, { merge: true });
      }
      transaction.set(challengeRef, {
        status: "winners_announced", lifecycleStatus: "winners_announced", winnersAnnouncedAt: now,
        winnerProposalId: proposalId, officialWinnerProposalId: proposalId,
        officialWinnerRecordIds: records.map((winner) => winner.id), officialWinnerRecordCount: records.length,
        officialWinnerRecordsValidatedAt: now, officialWinnerRecordsValidatedByAdminId: user!.uid,
        resultsPublishedAt: now, updatedAt: now
      }, { merge: true });
      transaction.set(proposalRef, { announcementStatus: "announced", announcedAt: now, announcedByAdminId: user!.uid, updatedAt: now }, { merge: true });
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: "challenge.winners_announced", targetType: "challenge", targetId: challengeId, reason, before: { status: latestChallenge.status ?? latestChallenge.lifecycleStatus ?? null }, after: { status: "winners_announced", officialWinnerRecordCount: records.length, officialWinnerRecordIds: records.map((winner) => winner.id) }, metadata: { proposalId, settlementId, winnerRecordIds: records.map((winner) => winner.id), confirmed: true } }, auditRef.id, now));
      return { alreadyAnnounced: false, now };
    });
    return ok({ challengeId, proposalId, status: "winners_announced", winnerCount: records.length, idempotent: result.alreadyAnnounced }, result.alreadyAnnounced ? "Winners were already announced." : "Winners announced from verified records.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "WINNER_ANNOUNCEMENT_FAILED";
    if (code === "WINNER_ANNOUNCEMENT_ON_HOLD") return fail("Winner announcement is paused while a financial or integrity hold is unresolved.", 409, undefined, code);
    if (code === "CHALLENGE_CANCELLED") return fail("Cancelled challenges cannot announce winners.", 409, undefined, code);
    if (code === "WINNER_ANNOUNCEMENT_NOT_DUE") return fail("The scheduled winner-announcement time has not arrived.", 409, undefined, code);
    if (code === "WINNER_PROPOSAL_NOT_APPROVED") return fail("An Admin-approved winner proposal is required.", 409, undefined, code);
    if (code === "WINNER_SETTLEMENT_MISMATCH") return fail("The settlement does not belong to this challenge and approved proposal.", 409, undefined, code);
    if (code === "WINNER_PROPOSAL_CHANGED") return fail("The approved proposal changed during winner verification. Reload it and review the current proposal.", 409, undefined, code);
    if (code === "WINNER_SETTLEMENT_MISSING") return fail("The approved winner settlement record is required.", 409, undefined, code);
    if (code === "WINNER_RECORDS_INVALID" || code === "OFFICIAL_WINNER_RECORDS_MISSING") return fail("Authoritative winner records could not be verified.", 409, undefined, code);
    return serverUnavailable("Winner announcement");
  }
}
