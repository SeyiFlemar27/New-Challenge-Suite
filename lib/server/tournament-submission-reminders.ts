import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";

const validEntry = new Set(["submitted", "approved", "active", "pending_moderation", "under_review"]);
/** Also used at email claim time: queued is never synonymous with delivered. */
export async function tournamentReminderEligible(db: Firestore, transaction: Transaction, value: Record<string, unknown>, now: Date) {
  const tournamentId = String(value.tournamentId ?? ""), matchId = String(value.reminderMatchId ?? ""), participantId = String(value.reminderParticipantId ?? "");
  const userId = String(value.userId ?? "");
  if (![tournamentId, matchId, participantId, userId].every(id => id && !id.includes("/"))) return false;
  const [tournament, match, participant, submission, account] = await transaction.getAll(
    db.collection("tournaments").doc(tournamentId), db.collection("tournamentMatches").doc(matchId),
    db.collection("tournamentParticipants").doc(participantId), db.collection("tournamentSubmissions").doc(`${tournamentId}_${matchId}_${participantId}`), db.collection("users").doc(userId)
  );
  return tournament.exists && isIndividualTournamentPolicy(tournament.data()!) && ["active", "round_active"].includes(String(tournament.data()?.status))
    && account.exists && account.data()?.disabled !== true && account.data()?.suspended !== true && !["suspended", "disabled", "deleted", "deactivated", "blocked", "deletion_requested", "anonymized"].includes(String(account.data()?.accountStatus))
    && match.data()?.tournamentId === tournamentId && match.data()?.status === "submissions_open" && [match.data()?.participantAId, match.data()?.participantBId].includes(participantId)
    && participant.data()?.tournamentId === tournamentId && participant.data()?.userId === value.userId && ["active", "registered"].includes(String(participant.data()?.status))
    && match.data()?.submissionDeadlineAt === value.reminderDeadlineAt && Date.parse(String(value.reminderDeadlineAt)) > now.getTime()
    && !validEntry.has(String(submission.data()?.status));
}

export async function queueTournamentSubmissionReminders(db: Firestore, tournamentId: string, now = new Date()) {
  const tournament = await db.collection("tournaments").doc(tournamentId).get();
  if (!tournament.exists || !isIndividualTournamentPolicy(tournament.data()!)) return { queued: 0 };
  const matches = await db.collection("tournamentMatches").where("tournamentId", "==", tournamentId).limit(131).get();
  if (matches.size > 130) throw new Error("TOURNAMENT_REMINDER_GRAPH_LIMIT");
  let queued = 0;
  for (const match of matches.docs) {
    const deadline = String(match.data().submissionDeadlineAt ?? ""), remaining = Date.parse(deadline) - now.getTime();
    if (match.data().status !== "submissions_open" || remaining <= 0 || remaining > 6 * 3_600_000 || !Number.isFinite(remaining)) continue;
    const hours = remaining <= 3_600_000 ? 1 : 6;
    for (const participantId of [match.data().participantAId, match.data().participantBId]) {
      if (typeof participantId !== "string" || !participantId || participantId.includes("/")) continue;
      const identity = createHash("sha256").update(`${tournamentId}|${match.id}|${participantId}|${deadline}|${hours}`).digest("hex");
      const didQueue = await db.runTransaction(async transaction => {
        const participant = await transaction.get(db.collection("tournamentParticipants").doc(participantId));
        const userId = String(participant.data()?.userId ?? "");
        if (!userId || userId.includes("/")) return false;
        const value = { tournamentId, userId, reminderMatchId: match.id, reminderParticipantId: participantId, reminderDeadlineAt: deadline, reminderHours: hours };
        const [existing, preferences] = await transaction.getAll(db.collection("tournamentReminderDeliveries").doc(identity), db.collection("notificationPreferences").doc(userId));
        if (existing.exists || !await tournamentReminderEligible(db, transaction, value, now)) return false;
        const prefs = preferences.data() ?? {}, title = "Match submission deadline approaching", message = "Your Tournament match still needs a valid entry. Open Match Details for the current deadline.";
        transaction.create(db.collection("notifications").doc(identity), { ...value, id: identity, title, message, body: message, type: "tournament_submission_reminder", category: "participation", essential: true, read: false, status: "unread", actionUrl: `/tournaments/${tournamentId}/matches/${match.id}`, entityType: "tournament", entityId: tournamentId, delivery: { inApp: true, email: false }, createdAt: now.toISOString() });
        if (prefs.challengeReminders !== false && prefs.email === true) transaction.create(db.collection("tournamentEmailOutbox").doc(identity), { ...value, title, message, category: "challengeReminders", status: "pending", recipientDeliveryVerified: false, createdAt: now.toISOString() });
        transaction.create(db.collection("tournamentReminderDeliveries").doc(identity), { ...value, queuedAt: now.toISOString(), emailDelivered: false });
        return true;
      });
      if (didQueue) queued++;
    }
  }
  return { queued };
}
