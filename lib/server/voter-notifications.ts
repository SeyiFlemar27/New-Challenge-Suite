import { createHash } from "node:crypto";
import { FieldPath, type Firestore, type Transaction } from "firebase-admin/firestore";
import { notificationEnabled } from "@/lib/notification-policy";
import { canVoteOnChallenge } from "@/lib/challenge-status";
import { votingAccountRestricted } from "@/lib/voting-account-policy";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { hasPublicVotingAccess, isPrivateChallengeRecord, userOwnsChallenge } from "@/lib/server/challenge-access";
import { deterministicId } from "@/lib/server/idempotency";
import { freeVoteGuardId, voteDateKeyForTimeZone } from "@/lib/server/voting";
import { validateTournamentVote, isTournamentCompetitorVoter } from "@/lib/server/tournament-operations";
import type { TournamentFoundation, TournamentMatchFoundation, TournamentRoundFoundation } from "@/lib/tournament-types";
import { AUTOMATIC_VOTING_SETTINGS, usesAutomaticVoting } from "@/lib/automatic-voting-policy";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";

export type VoterNotificationContext = { kind: "challenge"; id: string } | { kind: "match"; id: string; tournamentId: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function queueVoterAudience(db: Firestore, tx: Transaction, context: VoterNotificationContext, version: string) {
  const id = digest(`${context.kind}:${context.id}:results:${version}`);
  tx.create(db.collection("notificationAudienceProgress").doc(id), { context, mode: "results", version, status: "pending", createdAt: version, updatedAt: version });
}

export async function recoverVoterAudiences(db: Firestore, now = new Date()) {
  const state = db.collection("notificationRecoveryState").doc("voter_audiences"), cursor = (await state.get()).data()?.cursor;
  const base = db.collection("notificationAudienceProgress").where("status", "==", "pending").orderBy(FieldPath.documentId());
  let page = await (typeof cursor === "string" ? base.startAfter(cursor) : base).limit(25).get();
  if (page.empty && cursor) page = await base.limit(25).get();
  if (!page.empty) await state.set({ cursor: page.docs.at(-1)!.id, updatedAt: now.toISOString() });
  let pending = 0;
  for (const row of page.docs) {
    const data = row.data();
    try {
      if (data.context?.kind === "live_results") {
        const { deliverLiveEventResults } = await import("@/lib/server/live-event-result-notifications");
        await deliverLiveEventResults(db, row.id, now);
      } else {
        const context = data.context as VoterNotificationContext;
        const current = await db.collection(context.kind === "challenge" ? "challenges" : "tournamentMatches").doc(context.id).get();
        const record = current.data() ?? {};
        let recoveredDeadline = record.votingClosesAt;
        if (context.kind === "match" && data.mode === "reminder") {
          const parent = await db.collection("tournaments").doc(context.tournamentId).get();
          if (Number(parent.data()?.configVersion ?? 1) < 3 && typeof record.roundId === "string" && record.roundId && !record.roundId.includes("/")) recoveredDeadline = (await db.collection("tournamentRounds").doc(record.roundId).get()).data()?.votingClosesAt;
        }
        const version = data.mode === "reminder" ? String(context.kind === "match" ? recoveredDeadline : record.effectiveVotingEndsAt ?? record.votingDeadline ?? record.votingEndsAt) : String(context.kind === "match" ? record.confirmedAt : record.winnersApprovedAt);
        if (!current.exists || version !== data.version || data.mode === "reminder" && Date.parse(version) <= now.getTime()) { await row.ref.update({ status: "superseded", updatedAt: now.toISOString() }); continue; }
        await deliverVoterNotifications(db, context, data.mode, now);
      }
    }
    catch { pending++; }
  }
  return { processed: page.size, pending };
}
const blocked = (record: Record<string, unknown>) => ["cancelled", "canceled", "deleted", "paused", "held"].includes(String(record.status))
  || record.reviewRestricted === true || record.correctionReviewRestricted === true || record.resultDisputed === true || record.progressionHeld === true || record.correctionReviewRequired === true;

/** One bounded page of persisted votes, not a platform audience. Progress and
 * inbox writes commit together. Repeated votes/workers cannot reset read state.
 * Callers may repeat until complete, including after a delivery outage. */
export async function deliverVoterNotifications(db: Firestore, context: VoterNotificationContext, mode: "results" | "reminder", now = new Date()) {
  const economy = mode === "reminder" ? await getActiveEconomyRules(db) : null;
  return db.runTransaction(async tx => {
    const sourceRef = db.collection(context.kind === "challenge" ? "challenges" : "tournamentMatches").doc(context.id);
    const source = await tx.get(sourceRef), record = source.data() ?? {};
    const parent = context.kind === "match" ? await tx.get(db.collection("tournaments").doc(context.tournamentId)) : source;
    const owner = parent.data() ?? {};
    if (!source.exists || !parent.exists || blocked(record) || blocked(owner) || context.kind === "match" && record.tournamentId !== context.tournamentId) return { created: 0, complete: true, reason: "context_unavailable" };
    let round: Record<string, unknown> = {};
    const competitors: Array<{ id: string; record: Record<string, unknown> }> = [];
    if (mode === "reminder" && context.kind === "match") {
      if (![record.roundId, record.participantAId, record.participantBId].every(id => typeof id === "string" && id && !id.includes("/"))) return { created: 0, complete: true, reason: "match_dependencies_unavailable" };
      const collection = owner.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
      const [roundSnap, first, second] = await tx.getAll(db.collection("tournamentRounds").doc(String(record.roundId)), db.collection(collection).doc(String(record.participantAId)), db.collection(collection).doc(String(record.participantBId)));
      round = { ...roundSnap.data(), id: roundSnap.id };
      const validation = validateTournamentVote({ tournament: { ...owner, id: parent.id } as unknown as TournamentFoundation, match: { ...record, id: source.id } as unknown as TournamentMatchFoundation, round: round as unknown as TournamentRoundFoundation, now });
      const allowed = owner.participationMode === "team" ? ["checked_in", "active"] : ["registered", "checked_in", "active"];
      if (!roundSnap.exists || !validation.valid || [first, second].some(row => !row.exists || row.data()?.tournamentId !== context.tournamentId || !allowed.includes(String(row.data()?.status)))) return { created: 0, complete: true, reason: "match_vote_ineligible" };
      competitors.push(...[first, second].map(row => ({ id: row.id, record: row.data()! })));
    }
    const deadline = context.kind === "match" ? Number(owner.configVersion ?? 1) >= 3 ? record.votingClosesAt : round.votingClosesAt : record.effectiveVotingEndsAt ?? record.votingDeadline ?? record.votingEndsAt;
    const remaining = Date.parse(String(deadline)) - now.getTime();
    const verified = context.kind === "match" ? record.status === "confirmed" && record.resultStatus === "confirmed" && Boolean(record.confirmedAt)
      : record.resultsConfirmed === true && (record.adminWinnerApprovalStatus === "approved" || record.automaticWinnerVerificationStatus === "verified") && Boolean(record.winnersApprovedAt);
    const open = context.kind === "match" ? (record.status === "voting_open" || Number(owner.configVersion ?? 1) < 3 && record.status === "active") : canVoteOnChallenge(record, now);
    if (mode === "results" ? !verified : !open || !Number.isFinite(remaining) || remaining <= 0 || remaining > 3600000) return { created: 0, complete: true, reason: "not_due_or_verified" };
    const version = mode === "reminder" ? String(deadline) : String(record.confirmedAt ?? record.winnersApprovedAt);
    const eventId = digest(`${context.kind}:${context.id}:${mode}:${version}`);
    const progressRef = db.collection("notificationAudienceProgress").doc(eventId), progress = await tx.get(progressRef);
    if (progress.data()?.status === "completed") return { created: 0, complete: true };
    let query = db.collection(context.kind === "match" ? "tournamentVotes" : "votes").where(context.kind === "match" ? "matchId" : "challengeId", "==", context.id).orderBy(FieldPath.documentId());
    if (typeof progress.data()?.cursor === "string") query = query.startAfter(progress.data()!.cursor);
    const page = await tx.get(query.limit(50));
    const recipients = new Set(page.docs.filter(row => context.kind === "match" ? row.data().tournamentId === context.tournamentId && row.data().status === "recorded" : row.data().status === "counted").map(row => String(row.data().voterId ?? row.data().userId ?? "")).filter(uid => uid && !uid.includes("/")));
    const writes: Array<{ id: string; uid: string }> = [];
    const type = mode === "results" ? "voter_results" : "voting_reminder";
    for (const uid of recipients) {
      const id = digest(`${uid}\0${eventId}`);
      const [account, preferences, existing] = await tx.getAll(db.collection("users").doc(uid), db.collection("notificationPreferences").doc(uid), db.collection("notifications").doc(id));
      if (existing.exists || !account.exists || votingAccountRestricted(account.data()!) || !notificationEnabled(type, preferences.data() ?? {})) continue;
      if (context.kind === "challenge" && isPrivateChallengeRecord(owner) && !hasPublicVotingAccess(owner)) {
        const grant = await tx.get(db.collection("privateChallengeAccess").doc(`${context.id}_${uid}`));
        if (grant.data()?.status !== "approved") continue;
      }
      if (mode === "results") {
        const participation = context.kind === "challenge"
          ? await tx.get(db.collection("challengeParticipants").where("challengeId", "==", context.id).where("userId", "==", uid).limit(1))
          : await tx.get(db.collection("tournamentParticipants").where("tournamentId", "==", context.tournamentId).where("userId", "==", uid).limit(1));
        const membership = context.kind === "match" ? await tx.get(db.collection("tournamentTeamMemberships").doc(`${context.tournamentId}_${uid}`)) : null;
        if (!participation.empty || membership?.exists || userOwnsChallenge(owner, uid)) continue;
      } else {
        if (isSponsorProfile(account.data()!) || userOwnsChallenge(owner, uid)) continue;
        const membership = context.kind === "match" ? await tx.get(db.collection("tournamentTeamMemberships").doc(`${context.tournamentId}_${uid}`)) : null;
        if (competitors.some(row => isTournamentCompetitorVoter({ userId: uid, participationMode: owner.participationMode, competitor: row.record, membership: membership?.data(), teamId: row.id }))) continue;
        const zone = context.kind === "match" ? Number(owner.individualPolicyVersion ?? 0) > 0 || owner.participationMode === "individual" ? "UTC" : String(owner.timeZone ?? "UTC") : usesAutomaticVoting(owner) ? "UTC" : String(account.data()?.timeZone ?? "UTC");
        const day = voteDateKeyForTimeZone(now, zone);
        const key = context.kind === "match" ? digest(`${context.tournamentId}:${context.id}:${uid}:${day}`) : freeVoteGuardId(uid, context.id, day);
        const [free, paid, wallet] = await tx.getAll(
          db.collection(context.kind === "match" ? "tournamentFreeVoteDailyGuards" : "freeVoteDailyGuards").doc(key),
          db.collection(context.kind === "match" ? "tournamentPaidVoteDailyGuards" : "paidVoteDailyGuards").doc(context.kind === "match" ? key : deterministicId("paid_vote", uid, context.id, day)),
          db.collection("doroCoinWallets").doc(uid));
        const settings = (context.kind === "challenge" && usesAutomaticVoting(owner) ? AUTOMATIC_VOTING_SETTINGS : owner.votingSettings ?? {}) as Record<string, unknown>;
        const freeEligible = !free.exists && settings.allowFreeVotes !== false;
        const paidEligible = economy?.voting.paidVotingEnabled === true && (context.kind === "challenge" || Number(owner.configVersion ?? 1) >= 3 && (owner.voting as Record<string, unknown> | undefined)?.paidVotesActive === true) && settings.allowPaidVotes !== false && settings.allowDoroCoinVotes !== false && Number(wallet.data()?.balance ?? 0) >= 5 && Number(paid.data()?.quantity ?? 0) < Number(economy?.voting.paidVoteDailyLimit ?? 0);
        if (!freeEligible && !paidEligible) continue;
      }
      writes.push({ id, uid });
    }
    const createdAt = now.toISOString();
    for (const row of writes) tx.create(db.collection("notifications").doc(row.id), { id: row.id, userId: row.uid, type, essential: false, category: mode === "results" ? "voterResults" : "votingReminders", title: mode === "results" ? "Official results are ready" : "Voting closes soon", message: mode === "results" ? "Verified results are available for a competition you voted in. Financial settlement is tracked separately." : "A competition you voted in is closing soon. Open it to review the current deadline and voting options.", actionUrl: context.kind === "match" ? `/tournaments/${context.tournamentId}/matches/${context.id}` : mode === "results" ? `/winners/${context.id}` : `/challenges/${context.id}`, read: false, status: "unread", createdAt, delivery: { inApp: true, email: false, push: false } });
    const complete = page.size < 50;
    tx.set(progressRef, { context, mode, version, cursor: page.docs.at(-1)?.id ?? null, status: complete ? "completed" : "pending", createdAt: progress.data()?.createdAt ?? createdAt, updatedAt: createdAt });
    return { created: writes.length, complete };
  });
}
