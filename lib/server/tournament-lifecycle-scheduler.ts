import type { Firestore } from "firebase-admin/firestore";
import { createNotification } from "@/lib/server/notifications";
import { advanceWinner, finalPlacements, resolveTournamentNoSubmission, resolveTournamentSubmissionDeadline } from "@/lib/server/tournament-operations";
import { fail, ok } from "@/lib/server/responses";
import type { TournamentFoundation, TournamentMatchFoundation } from "@/lib/tournament-types";

const dateMs = (value: unknown) => { const result = new Date(String(value ?? "")).getTime(); return Number.isFinite(result) ? result : 0; };

export async function processTournamentLifecycleAction(args: {
  db: Firestore;
  id: string;
  tournament: TournamentFoundation & Record<string, unknown>;
  action: string;
  actorId: string;
  now?: Date;
}) {
  const { db, id, tournament, action, actorId } = args;
  const now = args.now ?? new Date();
  const nowIso = now.toISOString();
  const tournamentRef = db.collection("tournaments").doc(id);
  if (action === "process_match_deadlines") {
    const competitorCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
    const [roundsSnap, matchesSnap, submissionsSnap, competitorsSnap] = await Promise.all([
      db.collection("tournamentRounds").where("tournamentId", "==", id).limit(100).get(),
      db.collection("tournamentMatches").where("tournamentId", "==", id).limit(500).get(),
      db.collection("tournamentSubmissions").where("tournamentId", "==", id).limit(1000).get(),
      db.collection(competitorCollection).where("tournamentId", "==", id).limit(1000).get()
    ]);
    const competitorRecipients = new Map(competitorsSnap.docs.map((competitor) => {
      const data = competitor.data();
      const recipients = tournament.participationMode === "team"
        ? Array.isArray(data.memberUserIds) ? data.memberUserIds.map(String).filter(Boolean) : []
        : [String(data.userId ?? "")].filter(Boolean);
      return [competitor.id, recipients] as const;
    }));
    const deadlines = new Map(roundsSnap.docs.map((round) => [round.id, dateMs(round.data().endsAt)]));
    const submissions = submissionsSnap.docs.map((submission) => ({
      id: submission.id,
      ...submission.data()
    } as { id: string; matchId?: string | null; participantId?: string; status?: string }));
    const versionThree = Number(tournament.configVersion ?? 1) >= 3;
    const matches = matchesSnap.docs.map((match) => ({ id: match.id, ...match.data() } as TournamentMatchFoundation & Record<string, unknown>)).filter((match) => {
      const deadline = dateMs(match.submissionDeadlineAt) || deadlines.get(match.roundId) || 0;
      const eligibleState = versionThree ? ["submissions_open", "submission_review"].includes(match.status) : !["confirmed", "forfeit", "bye"].includes(match.status);
      return eligibleState && Boolean(match.participantAId && match.participantBId) && deadline > 0 && deadline <= now.getTime();
    });
    const outcomes: Array<{ matchId: string; action: string }> = [];
    for (const match of matches) {
      const matchSubmissions = submissions.filter((submission) => submission.matchId === match.id);
      if (versionThree) {
        const statusFor = (participantId: string | null) => matchSubmissions.find((submission) => submission.participantId === participantId)?.status ?? null;
        const decision = resolveTournamentSubmissionDeadline({ participantAStatus: statusFor(match.participantAId), participantBStatus: statusFor(match.participantBId), extensionAlreadyUsed: match.noSubmissionExtensionUsed === true, submissionDeadlineAt: String(match.submissionDeadlineAt ?? ""), now });
        const matchRef = db.collection("tournamentMatches").doc(match.id);
        if (decision.action === "waiting" || decision.action === "hold") continue;
        if (decision.action === "review") {
          await db.runTransaction(async (transaction) => {
            const current = await transaction.get(matchRef);
            if (!current.exists || !["submissions_open", "submission_review"].includes(String(current.data()?.status ?? ""))) return;
            if (current.data()?.status !== "submission_review") transaction.set(matchRef, { status: "submission_review", moderationHoldReason: "platform_moderation_pending", updatedAt: nowIso }, { merge: true });
          });
          outcomes.push({ matchId: match.id, action: "submission_review" });
          continue;
        }
        if (decision.action === "open_voting") {
          const tournamentRef = db.collection("tournaments").doc(id);
          const roundRef = db.collection("tournamentRounds").doc(match.roundId);
          const submissionRefs = [match.participantAId, match.participantBId].map((participantId) => db.collection("tournamentSubmissions").doc(`${id}_${match.id}_${participantId}`));
          const opened = await db.runTransaction(async (transaction) => {
            const [currentTournament, currentMatch, currentRound, submissionA, submissionB] = await Promise.all([
              transaction.get(tournamentRef), transaction.get(matchRef), transaction.get(roundRef), transaction.get(submissionRefs[0]), transaction.get(submissionRefs[1])
            ]);
            if (!currentTournament.exists || !currentMatch.exists || !currentRound.exists || currentRound.data()?.tournamentId !== id) return false;
            const current = currentMatch.data() ?? {};
            const currentSubmissionDecision = resolveTournamentSubmissionDeadline({ participantAStatus: submissionA.data()?.status ?? null, participantBStatus: submissionB.data()?.status ?? null, extensionAlreadyUsed: current.noSubmissionExtensionUsed === true, submissionDeadlineAt: String(current.submissionDeadlineAt ?? ""), now });
            if (!["submissions_open", "submission_review"].includes(String(current.status ?? "")) || currentSubmissionDecision.action !== "open_voting") return false;
            const votingClosesAt = new Date(now.getTime() + Number(currentTournament.data()?.votingDurationHours ?? 72) * 60 * 60 * 1000).toISOString();
            transaction.set(matchRef, { status: "voting_open", votingOpenedAt: nowIso, votingClosesAt, moderationHoldReason: null, nextLifecycleCheckAt: null, updatedAt: nowIso }, { merge: true });
            transaction.set(roundRef, { status: "active", startsAt: currentRound.data()?.startsAt ?? nowIso, updatedAt: nowIso }, { merge: true });
            const tournament = currentTournament.data() ?? {};
            if (!tournament.firstVotingOpenedAt) transaction.set(tournamentRef, { firstVotingOpenedAt: nowIso, tournamentVotingCutoffAt: nowIso, registrationRefundCutoffAt: nowIso, updatedAt: nowIso }, { merge: true });
            const auditRef = db.collection("tournamentAuditEvents").doc(`${match.id}_voting_opened`);
            transaction.set(auditRef, { id: auditRef.id, tournamentId: id, actorId: "system_tournament_lifecycle", action: "match_voting_opened", createdAt: nowIso, metadata: { matchId: match.id, votingOpenedAt: nowIso, votingClosesAt } }, { merge: true });
            return true;
          });
          outcomes.push({ matchId: match.id, action: opened ? "voting_opened" : "transition_rechecked" });
          continue;
        }
        if (decision.action === "extend") {
          const originalDeadline = dateMs(match.submissionDeadlineAt);
          if (!originalDeadline) continue;
          const extendedDeadline = new Date(originalDeadline + 12 * 60 * 60 * 1000).toISOString();
          const extended = await db.runTransaction(async (transaction) => {
            const current = await transaction.get(matchRef);
            if (!current.exists || current.data()?.noSubmissionExtensionUsed === true || !["submissions_open", "submission_review"].includes(String(current.data()?.status ?? ""))) return false;
            transaction.set(matchRef, { noSubmissionExtensionUsed: true, originalSubmissionDeadlineAt: current.data()?.originalSubmissionDeadlineAt ?? current.data()?.submissionDeadlineAt, submissionExtensionAt: nowIso, submissionDeadlineAt: extendedDeadline, status: "submissions_open", moderationHoldReason: null, nextLifecycleCheckAt: null, updatedAt: nowIso }, { merge: true });
            const auditRef = db.collection("tournamentAuditEvents").doc(`${match.id}_no_submission_extension`);
            transaction.set(auditRef, { id: auditRef.id, tournamentId: id, actorId: "system_tournament_lifecycle", action: "no_submission_extension", createdAt: nowIso, metadata: { matchId: match.id, extensionHours: 12, submissionDeadlineAt: extendedDeadline } }, { merge: true });
            return true;
          });
          if (extended) {
            const recipientIds = [...new Set([match.participantAId, match.participantBId].flatMap((competitorId) => competitorRecipients.get(String(competitorId ?? "")) ?? []))];
            await Promise.allSettled(recipientIds.map((recipientId) => createNotification(db, { userId: recipientId, type: "tournament_submission_extension", title: "Tournament submission extended", body: "Both competitors received one 12-hour submission extension.", entityType: "tournament_match", entityId: match.id, actionUrl: `/tournaments/${id}/matches/${match.id}`, idempotencyKey: `${match.id}_no_submission_extension_${recipientId}` })));
          }
          outcomes.push({ matchId: match.id, action: extended ? "extension" : "transition_rechecked" });
          continue;
        }
        if (decision.action === "double_forfeit_hold") {
          const competitorCollectionV3 = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
          const participantARef = db.collection(competitorCollectionV3).doc(String(match.participantAId));
          const participantBRef = db.collection(competitorCollectionV3).doc(String(match.participantBId));
          const submissionARef = db.collection("tournamentSubmissions").doc(`${id}_${match.id}_${match.participantAId}`);
          const submissionBRef = db.collection("tournamentSubmissions").doc(`${id}_${match.id}_${match.participantBId}`);
          const dependentRefs = [match.nextMatchId, match.loserNextMatchId].filter(Boolean).map((matchId) => db.collection("tournamentMatches").doc(String(matchId)));
          const held = await db.runTransaction(async (transaction) => {
            const [current, participantA, participantB, submissionA, submissionB, ...dependents] = await Promise.all([transaction.get(matchRef), transaction.get(participantARef), transaction.get(participantBRef), transaction.get(submissionARef), transaction.get(submissionBRef), ...dependentRefs.map((ref) => transaction.get(ref))]);
            if (!current.exists || !participantA.exists || !participantB.exists || current.data()?.noSubmissionExtensionUsed !== true || !["submissions_open", "submission_review"].includes(String(current.data()?.status ?? ""))) return false;
            const currentData = current.data() ?? {};
            const stillDoubleForfeit = resolveTournamentSubmissionDeadline({ participantAStatus: submissionA.data()?.status ?? null, participantBStatus: submissionB.data()?.status ?? null, extensionAlreadyUsed: currentData.noSubmissionExtensionUsed === true, submissionDeadlineAt: String(currentData.submissionDeadlineAt ?? ""), now });
            if (stillDoubleForfeit.action !== "double_forfeit_hold") return false;
            for (const [participantRef, participantSnapshot] of [[participantARef, participantA], [participantBRef, participantB]] as const) {
              const losses = Number(participantSnapshot.data()?.lossCount ?? 0) + 1;
              transaction.set(participantRef, { lossCount: losses, status: tournament.format === "single_elimination" || (tournament.format === "double_elimination" && losses >= 2) ? "eliminated" : "active", updatedAt: nowIso }, { merge: true });
            }
            transaction.set(matchRef, { status: "double_forfeit_hold", resultStatus: "under_review", winnerParticipantId: null, loserParticipantId: null, doubleForfeitAt: nowIso, dependencyHoldReason: "DOUBLE_FORFEIT_NO_VERIFIED_WINNER", updatedAt: nowIso }, { merge: true });
            dependents.forEach((dependent, index) => { if (dependent.exists && !["confirmed", "forfeit", "completed"].includes(String(dependent.data()?.status ?? ""))) transaction.set(dependent.ref, { status: "held", dependencyHoldReason: `DOUBLE_FORFEIT:${match.id}`, updatedAt: nowIso }, { merge: true }); });
            const exceptionRef = db.collection("tournamentExceptions").doc(`${match.id}_double_forfeit`);
            transaction.set(exceptionRef, { id: exceptionRef.id, tournamentId: id, matchId: match.id, type: "double_forfeit_dependency_hold", status: "open", reason: "Both competitors failed to provide valid content after the single 12-hour extension. No winner was selected.", createdAt: nowIso, updatedAt: nowIso }, { merge: true });
            const auditRef = db.collection("tournamentAuditEvents").doc(`${match.id}_double_forfeit`);
            transaction.set(auditRef, { id: auditRef.id, tournamentId: id, actorId: "system_tournament_lifecycle", action: "double_forfeit_dependency_hold", createdAt: nowIso, metadata: { matchId: match.id, affectedMatchIds: dependentRefs.map((ref) => ref.id) } }, { merge: true });
            return true;
          });
          outcomes.push({ matchId: match.id, action: held ? "double_forfeit_hold" : "transition_rechecked" });
          continue;
        }
        if (decision.action === "forfeit") {
          const winnerId = decision.winnerSlot === "A" ? String(match.participantAId) : String(match.participantBId);
          const loserId = decision.winnerSlot === "A" ? String(match.participantBId) : String(match.participantAId);
          const competitorCollectionV3 = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
          const winnerRef = db.collection(competitorCollectionV3).doc(winnerId);
          const loserRef = db.collection(competitorCollectionV3).doc(loserId);
          const nextRef = match.nextMatchId ? db.collection("tournamentMatches").doc(match.nextMatchId) : null;
          const loserNextRef = match.loserNextMatchId ? db.collection("tournamentMatches").doc(match.loserNextMatchId) : null;
          const resetRef = match.resetMatchId ? db.collection("tournamentMatches").doc(match.resetMatchId) : null;
          const finalized = await db.runTransaction(async (transaction) => {
            const [currentTournament, current, submissionA, submissionB, winner, loser, next, loserNext, reset] = await Promise.all([
              transaction.get(tournamentRef), transaction.get(matchRef),
              transaction.get(db.collection("tournamentSubmissions").doc(`${id}_${match.id}_${match.participantAId}`)),
              transaction.get(db.collection("tournamentSubmissions").doc(`${id}_${match.id}_${match.participantBId}`)),
              transaction.get(winnerRef), transaction.get(loserRef),
              nextRef ? transaction.get(nextRef) : Promise.resolve(null),
              loserNextRef ? transaction.get(loserNextRef) : Promise.resolve(null),
              resetRef ? transaction.get(resetRef) : Promise.resolve(null)
            ]);
            if (!currentTournament.exists || !current.exists || !winner.exists || !loser.exists) return false;
            if (!["active", "round_active"].includes(String(currentTournament.data()?.status ?? ""))) return false;
            const currentData = current.data() ?? {};
            if (currentData.tournamentId !== id || currentData.participantAId !== match.participantAId || currentData.participantBId !== match.participantBId || !["submissions_open", "submission_review"].includes(String(currentData.status ?? ""))) return false;
            const rechecked = resolveTournamentSubmissionDeadline({ participantAStatus: submissionA.data()?.status ?? null, participantBStatus: submissionB.data()?.status ?? null, extensionAlreadyUsed: true, submissionDeadlineAt: String(currentData.submissionDeadlineAt ?? ""), now });
            if (rechecked.action !== "forfeit") return false;
            const actualWinnerId = rechecked.winnerSlot === "A" ? String(currentData.participantAId) : String(currentData.participantBId);
            const actualLoserId = rechecked.winnerSlot === "A" ? String(currentData.participantBId) : String(currentData.participantAId);
            if (actualWinnerId !== winnerId || actualLoserId !== loserId) return false;
            const format = String(currentTournament.data()?.format ?? "single_elimination");
            const previousLosses = Number(loser.data()?.lossCount ?? 0);
            const nextLosses = previousLosses + 1;
            const loserContinues = format === "double_elimination" && nextLosses < 2 && Boolean(loserNext?.exists);
            const winnerAdvancement = advanceWinner({ match: { ...currentData, id: current.id, winnerParticipantId: winnerId, loserParticipantId: loserId } as TournamentMatchFoundation, existingNextMatch: next?.exists ? { id: next.id, ...next.data() } as TournamentMatchFoundation : null });
            if (!winnerAdvancement.advanced && winnerAdvancement.code !== "FINAL_PLACEMENT_READY") throw Object.assign(new Error("Tournament advancement conflicts with an assigned bracket slot."), { code: "TOURNAMENT_ADVANCEMENT_CONFLICT" });
            const openedAt = nowIso;
            const submissionDurationMs = Number(currentTournament.data()?.submissionDurationHours ?? 48) * 60 * 60 * 1000;
            const openDependent = (value: TournamentMatchFoundation | null, participantId?: string, slot?: string | null) => {
              if (!value) return null;
              const updated = { ...value };
              if (participantId && slot === "A") updated.participantAId = participantId;
              if (participantId && slot === "B") updated.participantBId = participantId;
              if (!updated.participantAId || !updated.participantBId || ["confirmed", "forfeit", "bye", "completed"].includes(updated.status)) return updated;
              return { ...updated, status: "submissions_open" as const, openedAt, submissionsOpenedAt: openedAt, submissionDeadlineAt: new Date(now.getTime() + submissionDurationMs).toISOString(), updatedAt: openedAt };
            };
            const nextToPersist = openDependent(winnerAdvancement.nextMatch ?? null);
            const loserSlot = String(currentData.loserNextSlot ?? "");
            if (loserContinues && (!['A', 'B'].includes(loserSlot) || ((loserSlot === "A" ? loserNext?.data()?.participantAId : loserNext?.data()?.participantBId) && (loserSlot === "A" ? loserNext?.data()?.participantAId : loserNext?.data()?.participantBId) !== loserId))) {
              throw Object.assign(new Error("The loser-bracket advancement slot requires review."), { code: "TOURNAMENT_LOSER_ADVANCEMENT_CONFLICT" });
            }
            const loserMatch = loserContinues ? openDependent(loserNext?.exists ? { id: loserNext.id, ...loserNext.data() } as TournamentMatchFoundation : null, loserId, loserSlot) : null;
            const resetRequired = format === "double_elimination" && currentData.bracket === "grand_final" && Boolean(currentData.resetMatchId) && previousLosses === 0;
            const resetMatch = resetRequired && reset?.exists ? openDependent({ ...({ id: reset.id, ...reset.data() } as TournamentMatchFoundation), participantAId: winnerId, participantBId: loserId }) : null;
            const finalPlacementRows = !currentData.nextMatchId && currentData.bracket !== "losers" && !resetRequired
              ? finalPlacements({ finalMatch: { ...currentData, id: current.id, winnerParticipantId: winnerId, loserParticipantId: loserId } as TournamentMatchFoundation, bronzeMatch: null })
              : [];
            const roundIds = [...new Set([nextToPersist?.roundId, loserMatch?.roundId, resetMatch?.roundId].filter((value): value is string => typeof value === "string" && Boolean(value)))];
            const roundSnapshots = await Promise.all(roundIds.map((roundId) => transaction.get(db.collection("tournamentRounds").doc(roundId))));
            transaction.set(matchRef, { status: "forfeit", resultStatus: "confirmed", winnerParticipantId: winnerId, loserParticipantId: loserId, forfeitReason: "submission_deadline_missed", forfeitedAt: nowIso, confirmedAt: nowIso, confirmedBy: "system_tournament_lifecycle", updatedAt: nowIso }, { merge: true });
            transaction.set(winnerRef, { status: "active", updatedAt: nowIso }, { merge: true });
            transaction.set(loserRef, { lossCount: nextLosses, status: loserContinues ? "active" : "eliminated", updatedAt: nowIso }, { merge: true });
            if (nextToPersist) transaction.set(db.collection("tournamentMatches").doc(nextToPersist.id), nextToPersist, { merge: true });
            if (loserMatch) transaction.set(db.collection("tournamentMatches").doc(loserMatch.id), loserMatch, { merge: true });
            if (resetMatch) transaction.set(db.collection("tournamentMatches").doc(resetMatch.id), resetMatch, { merge: true });
            roundSnapshots.forEach((snapshot) => { if (snapshot.exists && snapshot.data()?.tournamentId === id) transaction.set(snapshot.ref, { status: "active", startsAt: snapshot.data()?.startsAt ?? openedAt, updatedAt: openedAt }, { merge: true }); });
            finalPlacementRows.forEach((placement) => transaction.set(db.collection("tournamentPlacements").doc(`${id}_${placement.placement}`), { ...placement, id: `${id}_${placement.placement}`, tournamentId: id, userId: tournament.participationMode === "team" ? null : placement.participantId, teamId: tournament.participationMode === "team" ? placement.participantId : null, sourceMatchId: match.id, lockedAt: nowIso, payoutStatus: "pending_admin_review" }, { merge: true }));
            if (finalPlacementRows.length) transaction.set(tournamentRef, { status: "under_review", resultsUnderReviewAt: nowIso, updatedAt: nowIso }, { merge: true });
            transaction.create(db.collection("tournamentAuditEvents").doc(`${match.id}_submission_forfeit`), { id: `${match.id}_submission_forfeit`, tournamentId: id, actorId: "system_tournament_lifecycle", action: "submission_forfeit", createdAt: nowIso, metadata: { matchId: match.id, winnerId, loserId, nextLossCount: nextLosses } });
            if (resetRequired && !resetMatch) {
              transaction.set(tournamentRef, { status: "under_review", resultsUnderReviewAt: nowIso, updatedAt: nowIso }, { merge: true });
              transaction.set(db.collection("tournamentExceptions").doc(`${match.id}_missing_reset_match`), { id: `${match.id}_missing_reset_match`, tournamentId: id, matchId: match.id, type: "missing_required_reset_match", status: "open", reason: "The double-elimination final requires a reset match, but its configured record is missing. No champion was announced.", createdAt: nowIso, updatedAt: nowIso }, { merge: true });
            }
            if (!loserContinues && format === "double_elimination" && nextLosses < 2) transaction.set(db.collection("tournamentExceptions").doc(`${match.id}_missing_loser_path`), { id: `${match.id}_missing_loser_path`, tournamentId: id, matchId: match.id, type: "missing_loser_bracket_path", status: "open", reason: "The competitor remains eligible after one loss, but the configured loser-bracket match is unavailable. The match result is recorded and advancement requires review.", createdAt: nowIso, updatedAt: nowIso }, { merge: true });
            return true;
          });
          outcomes.push({ matchId: match.id, action: finalized ? "forfeit" : "transition_rechecked" });
          continue;
        }
      }
      const validStatuses = versionThree ? ["approved", "active"] : ["submitted", "approved", "pending_moderation", "under_review"];
      const valid = matchSubmissions.filter((submission) => validStatuses.includes(String(submission.status)));
      const aSubmitted = valid.some((submission) => submission.participantId === match.participantAId);
      const bSubmitted = valid.some((submission) => submission.participantId === match.participantBId);
      if (valid.some((submission) => ["pending_moderation", "under_review"].includes(String(submission.status))) && !(aSubmitted && bSubmitted)) {
        await db.collection("tournamentMatches").doc(match.id).set({ status: "admin_review", noSubmissionReviewReason: "platform_moderation_pending", updatedAt: nowIso }, { merge: true });
        outcomes.push({ matchId: match.id, action: "admin_review" });
        continue;
      }
      const resolution = resolveTournamentNoSubmission({ participantASubmitted: aSubmitted, participantBSubmitted: bSubmitted, extensionAlreadyUsed: match.noSubmissionExtensionUsed === true });
      if (resolution.action === "extend") {
        const extensionEndsAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
        await db.runTransaction(async (transaction) => {
          const ref = db.collection("tournamentMatches").doc(match.id);
          const current = await transaction.get(ref);
          if (current.data()?.noSubmissionExtensionUsed === true || ["confirmed", "forfeit"].includes(String(current.data()?.status ?? ""))) return;
          transaction.set(ref, { noSubmissionExtensionUsed: true, submissionDeadlineAt: extensionEndsAt, status: "awaiting_submission", updatedAt: nowIso }, { merge: true });
          transaction.create(db.collection("tournamentAuditEvents").doc(`${match.id}_no_submission_extension`), { id: `${match.id}_no_submission_extension`, tournamentId: id, actorId: actorId, action: "no_submission_extension", createdAt: nowIso, metadata: { matchId: match.id, extensionHours: 12 } });
        });
        const recipientIds = [...new Set([match.participantAId, match.participantBId].flatMap((competitorId) => competitorRecipients.get(String(competitorId ?? "")) ?? []))];
        await Promise.allSettled(recipientIds.map((recipientId) => createNotification(db, { userId: recipientId, type: "tournament_submission_extension", title: "Tournament submission extended", body: "Both competitors received one 12-hour submission extension.", entityType: "tournament_match", entityId: match.id, actionUrl: `/tournaments/${id}/matches/${match.id}`, idempotencyKey: `${match.id}_no_submission_extension_${recipientId}` })));
        outcomes.push({ matchId: match.id, action: "extension" });
      } else if (resolution.action === "forfeit") {
        const winnerId = resolution.winnerSlot === "A" ? match.participantAId : match.participantBId;
        const loserId = resolution.winnerSlot === "A" ? match.participantBId : match.participantAId;
        const nextSnap = match.nextMatchId ? await db.collection("tournamentMatches").doc(match.nextMatchId).get() : null;
        const advancement = advanceWinner({ match: { ...match, winnerParticipantId: winnerId, loserParticipantId: loserId }, existingNextMatch: nextSnap?.exists ? { id: nextSnap.id, ...nextSnap.data() } as TournamentMatchFoundation : null });
        await db.runTransaction(async (transaction) => {
          const ref = db.collection("tournamentMatches").doc(match.id);
          const current = await transaction.get(ref);
          if (["confirmed", "forfeit"].includes(String(current.data()?.status ?? ""))) return;
          transaction.set(ref, { status: "forfeit", resultStatus: "confirmed", winnerParticipantId: winnerId, loserParticipantId: loserId, forfeitReason: "submission_deadline_missed", forfeitedAt: nowIso, confirmedAt: nowIso, confirmedBy: "system_deadline_processor", updatedAt: nowIso }, { merge: true });
          if (advancement.nextMatch) transaction.set(db.collection("tournamentMatches").doc(advancement.nextMatch.id), advancement.nextMatch, { merge: true });
          transaction.create(db.collection("tournamentAuditEvents").doc(`${match.id}_submission_forfeit`), { id: `${match.id}_submission_forfeit`, tournamentId: id, actorId: actorId, action: "submission_forfeit", createdAt: nowIso, metadata: { matchId: match.id, winnerId, loserId } });
        });
        outcomes.push({ matchId: match.id, action: "forfeit" });
      } else if (resolution.action === "admin_review") {
        await db.collection("tournamentMatches").doc(match.id).set({ status: "admin_review", noSubmissionReviewReason: "both_absent_after_extension", updatedAt: nowIso }, { merge: true });
        outcomes.push({ matchId: match.id, action: "admin_review" });
      }
    }
    if (versionThree) {
      for (const match of matchesSnap.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as TournamentMatchFoundation & Record<string, unknown>)) {
        const votingClosesAt = dateMs(match.votingClosesAt);
        if (match.status !== "voting_open" || votingClosesAt <= 0 || votingClosesAt > now.getTime()) continue;
        const matchRef = db.collection("tournamentMatches").doc(match.id);
        const closed = await db.runTransaction(async (transaction) => {
          const current = await transaction.get(matchRef);
          if (!current.exists || current.data()?.tournamentId !== id || current.data()?.status !== "voting_open" || dateMs(current.data()?.votingClosesAt) > now.getTime()) return false;
          transaction.set(matchRef, { status: "voting_closed", votingClosedAt: nowIso, updatedAt: nowIso }, { merge: true });
          const auditRef = db.collection("tournamentAuditEvents").doc(`${match.id}_voting_closed`);
          transaction.set(auditRef, { id: auditRef.id, tournamentId: id, actorId: "system_tournament_lifecycle", action: "match_voting_closed", createdAt: nowIso, metadata: { matchId: match.id, votingClosedAt: nowIso } }, { merge: true });
          return true;
        });
        if (closed) outcomes.push({ matchId: match.id, action: "voting_closed" });
      }
    }
    return ok({ processed: outcomes.length, outcomes, clientTimerUsed: false }, "Tournament match deadlines processed server-side.");
  }

  if (action === "process_check_in_close") {
    if (!tournament.requiresCheckIn) return ok({ released: 0, offers: 0, status: "not_required" }, "Tournament check-in is not required.");
    if (!tournament.checkInClosesAt || dateMs(tournament.checkInClosesAt) > now.getTime()) return fail("Check-in is still open.", 409, undefined, "TOURNAMENT_CHECK_IN_OPEN");
    const competitorsCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
    const [competitorsSnap, waitlistSnap] = await Promise.all([db.collection(competitorsCollection).where("tournamentId", "==", id).limit(1000).get(), db.collection("tournamentWaitlist").where("tournamentId", "==", id).limit(1000).get()]);
    const noShows = competitorsSnap.docs.filter((competitor) => { const data = competitor.data(); const checkedIn = tournament.participationMode === "team" ? data.status === "checked_in" : data.checkInStatus === "checked_in"; return !checkedIn && ["registered", "ready", "confirmed"].includes(String(data.status ?? "")); });
    const waiting = waitlistSnap.docs.filter((item) => item.data().status === "waiting").sort((left, right) => Number(left.data().position ?? left.data().waitlistPosition ?? Number.MAX_SAFE_INTEGER) - Number(right.data().position ?? right.data().waitlistPosition ?? Number.MAX_SAFE_INTEGER));
    const offerExpiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
    const offeredCandidates = waiting.slice(0, noShows.length);
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(tournamentRef);
      if (current.data()?.noShowResolutionStatus === "completed") return;
      noShows.forEach((competitor) => transaction.set(competitor.ref, { status: "no_show", noShowAt: nowIso, updatedAt: nowIso }, { merge: true }));
      offeredCandidates.forEach((candidate, index) => { const offerRef = db.collection("tournamentWaitlistOffers").doc(`${id}_${candidate.id}_no_show_${index + 1}`); transaction.set(candidate.ref, { status: "invited", activeOfferId: offerRef.id, updatedAt: nowIso }, { merge: true }); transaction.create(offerRef, { id: offerRef.id, tournamentId: id, waitlistId: candidate.id, userId: candidate.data().userId ?? null, teamId: candidate.data().teamId ?? null, status: "pending", offeredAt: nowIso, offerExpiresAt, createdAt: nowIso, updatedAt: nowIso }); });
      transaction.set(tournamentRef, { noShowResolutionStatus: noShows.length && waiting.length ? "waitlist_offers_pending" : "completed", noShowsResolvedAt: nowIso, waitlistResolutionClosesAt: noShows.length && waiting.length ? offerExpiresAt : nowIso, updatedAt: nowIso }, { merge: true });
      transaction.create(db.collection("tournamentAuditEvents").doc(`${id}_check_in_close_processed`), { id: `${id}_check_in_close_processed`, tournamentId: id, actorId: actorId, action: "check_in_close_processed", createdAt: nowIso, metadata: { noShowCount: noShows.length, offerCount: Math.min(noShows.length, waiting.length) } });
    });
    await Promise.allSettled(offeredCandidates.map(async (candidate) => {
      const data = candidate.data();
      let recipientIds = [String(data.userId ?? "")].filter(Boolean);
      if (!recipientIds.length && data.teamId) {
        const teamSnap = await db.collection("tournamentTeams").doc(String(data.teamId)).get();
        recipientIds = Array.isArray(teamSnap.data()?.memberUserIds) ? teamSnap.data()!.memberUserIds.map(String).filter(Boolean) : [];
      }
      await Promise.allSettled(recipientIds.map((recipientId) => createNotification(db, { userId: recipientId, type: "tournament_waitlist_offer", title: "Tournament place available", body: "A released tournament place is available for a limited time.", entityType: "tournament", entityId: id, actionUrl: `/tournaments/${id}/me`, idempotencyKey: `${id}_${candidate.id}_no_show_offer_${recipientId}` })));
    }));
    return ok({ released: noShows.length, offers: Math.min(noShows.length, waiting.length), offerExpiresAt, refundProviderCalled: false }, "Check-in no-shows and waitlist offers processed.");
  }

  if (action === "process_waitlist_offers") {
    const [offersSnap, waitlistSnap] = await Promise.all([
      db.collection("tournamentWaitlistOffers").where("tournamentId", "==", id).limit(1000).get(),
      db.collection("tournamentWaitlist").where("tournamentId", "==", id).limit(1000).get()
    ]);
    const expiredOffers = offersSnap.docs.filter((offer) => offer.data().status === "pending" && dateMs(offer.data().offerExpiresAt) <= now.getTime());
    if (!expiredOffers.length) return ok({ expired: 0, replacementOffers: 0, status: tournament.noShowResolutionStatus ?? "not_pending" }, "No expired waitlist offers require processing.");
    const waiting = waitlistSnap.docs.filter((item) => item.data().status === "waiting").sort((left, right) => Number(left.data().position ?? left.data().waitlistPosition ?? Number.MAX_SAFE_INTEGER) - Number(right.data().position ?? right.data().waitlistPosition ?? Number.MAX_SAFE_INTEGER));
    const replacements = waiting.slice(0, expiredOffers.length);
    const replacementExpiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
    await db.runTransaction(async (transaction) => {
      const currentTournament = await transaction.get(tournamentRef);
      if (currentTournament.data()?.noShowResolutionStatus === "completed") return;
      expiredOffers.forEach((offer) => {
        transaction.set(offer.ref, { status: "expired", expiredAt: nowIso, updatedAt: nowIso }, { merge: true });
        const waitlistId = String(offer.data().waitlistId ?? "");
        if (waitlistId) transaction.set(db.collection("tournamentWaitlist").doc(waitlistId), { status: "offer_expired", activeOfferId: null, updatedAt: nowIso }, { merge: true });
      });
      replacements.forEach((candidate, index) => {
        const sourceOffer = expiredOffers[index];
        const offerRef = db.collection("tournamentWaitlistOffers").doc(`${id}_${candidate.id}_replacement_${sourceOffer.id}`);
        transaction.set(candidate.ref, { status: "invited", activeOfferId: offerRef.id, updatedAt: nowIso }, { merge: true });
        transaction.create(offerRef, { id: offerRef.id, tournamentId: id, waitlistId: candidate.id, userId: candidate.data().userId ?? null, teamId: candidate.data().teamId ?? null, replacesOfferId: sourceOffer.id, status: "pending", offeredAt: nowIso, offerExpiresAt: replacementExpiresAt, createdAt: nowIso, updatedAt: nowIso });
      });
      transaction.set(tournamentRef, { noShowResolutionStatus: replacements.length ? "waitlist_offers_pending" : "completed", waitlistResolutionClosesAt: replacements.length ? replacementExpiresAt : nowIso, updatedAt: nowIso }, { merge: true });
      transaction.create(db.collection("tournamentAuditEvents").doc(`${id}_waitlist_expiry_${nowIso}`), { id: `${id}_waitlist_expiry_${nowIso}`, tournamentId: id, actorId: actorId, action: "waitlist_offers_expired", createdAt: nowIso, metadata: { expiredCount: expiredOffers.length, replacementOfferCount: replacements.length } });
    });
    return ok({ expired: expiredOffers.length, replacementOffers: replacements.length, offerExpiresAt: replacements.length ? replacementExpiresAt : null, refundProviderCalled: false }, "Expired waitlist offers processed server-side.");
  }
  return fail("Choose a valid Tournament lifecycle action.", 400, undefined, "TOURNAMENT_LIFECYCLE_ACTION_INVALID");

}
