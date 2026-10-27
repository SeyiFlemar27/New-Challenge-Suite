import type { Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";

type Row = Record<string, unknown> & { id: string };
type Feed = { state: "waiting" | "empty" | "entrant" | "conflict"; participantId?: string };
const resolved = new Set(["confirmed", "forfeit", "bye"]);
const mutable = new Set(["scheduled", "waiting_for_entrants", "ready", "held"]);
const recoveryHold = "INDIVIDUAL_RECOVERY_REVIEW";

/** No losses, wins, votes or prize placements are manufactured by this projection. */
export function planIndividualBracketRecovery(tournament: Row, input: Row[], participants: Row[], now: Date) {
  if (!isIndividualTournamentPolicy(tournament) || tournament.participationMode !== "individual") return { updates: [] as Row[], conflicts: [] as string[] };
  const matches = input.map(row => ({ ...row }));
  const competitors = new Map(participants.map(row => [row.id, row]));
  const changed = new Map<string, Row>();
  const conflicts = new Set<string>();
  const allowed = (id: unknown, target: Row) => {
    if (typeof id !== "string") return false;
    const record = competitors.get(id);
    if (!record || record.tournamentId !== tournament.id || ["disqualified", "withdrawn", "refunded", "rejected"].includes(String(record.status))) return false;
    const limit = tournament.format === "double_elimination" || target.bracket === "bronze" ? 2 : 1;
    return Number(record.lossCount ?? 0) < limit;
  };
  const feed = (target: Row, slot: "A" | "B"): Feed => {
    const sources = matches.flatMap(source => [
      ...(source.nextMatchId === target.id && source.nextSlot === slot ? [{ source, loser: false }] : []),
      ...(source.loserNextMatchId === target.id && source.loserNextSlot === slot ? [{ source, loser: true }] : [])
    ]);
    if (sources.length > 1) return { state: "conflict" };
    if (!sources.length) {
      const id = target[`participant${slot}Id`];
      if (typeof id === "string" && competitors.get(id)?.recoveryAccountReview === true) return { state: "conflict" };
      return id ? allowed(id, target) ? { state: "entrant", participantId: String(id) } : { state: "empty" } : { state: "waiting" };
    }
    const { source, loser } = sources[0];
    if (source.recoveryOutcome === "empty") return { state: "empty" };
    if (source.status === "double_forfeit_hold") {
      if (!loser) return { state: "empty" };
      if ([source.participantAId, source.participantBId].some(id => typeof id === "string" && competitors.get(id)?.recoveryAccountReview === true)) return { state: "conflict" };
      const eligible = [source.participantAId, source.participantBId].filter(id => allowed(id, target));
      // Owner's D24 clarification: preserve both first-loss entrants; no play-in.
      return eligible.length > 1 ? { state: "conflict" } : eligible.length === 1 ? { state: "entrant", participantId: String(eligible[0]) } : { state: "empty" };
    }
    if (!resolved.has(String(source.status)) || source.resultStatus === "disputed") return { state: "waiting" };
    const id = loser ? source.loserParticipantId : source.status === "bye" ? source.byeParticipantId ?? source.winnerParticipantId : source.winnerParticipantId;
    if (!id) return { state: "empty" };
    if (typeof id === "string" && competitors.get(id)?.recoveryAccountReview === true) return { state: "conflict" };
    return allowed(id, target) ? { state: "entrant", participantId: String(id) } : { state: "empty" };
  };
  const update = (match: Row, patch: Record<string, unknown>) => {
    Object.assign(match, patch, { updatedAt: now.toISOString() });
    changed.set(match.id, { ...match });
  };
  for (let pass = 0; pass < matches.length; pass++) {
    let progressed = false;
    for (const match of matches) {
      if (!mutable.has(String(match.status)) || match.recoveryOutcome === "empty" || match.dependencyHoldReason && !String(match.dependencyHoldReason).startsWith("DOUBLE_FORFEIT:") && match.dependencyHoldReason !== recoveryHold && !(match.dependencyHoldReason === "ADMIN_DISQUALIFICATION" && match.disqualificationRecoveryAllowed === true)) continue;
      const a = feed(match, "A"), b = feed(match, "B");
      if ([a, b].some(value => value.state === "conflict")) { conflicts.add(match.id); continue; }
      if ([a, b].some(value => value.state === "waiting")) {
        if (match.status === "held") update(match, { status: "scheduled", dependencyHoldReason: null });
        continue;
      }
      const ids = [a, b].filter(value => value.state === "entrant").map(value => value.participantId!);
      if (ids.length === 2) {
        if (ids[0] === ids[1] || ["A", "B"].some((slot, index) => match[`participant${slot}Id`] && match[`participant${slot}Id`] !== ids[index])) { conflicts.add(match.id); continue; }
        update(match, { participantAId: ids[0], participantBId: ids[1], status: "submissions_open", dependencyHoldReason: null, openedAt: now.toISOString(), submissionsOpenedAt: now.toISOString(), submissionDeadlineAt: new Date(now.getTime() + Number(tournament.submissionDurationHours ?? 48) * 3_600_000).toISOString() });
      } else if (ids.length === 1 && match.nextMatchId) {
        update(match, { status: "bye", resultStatus: "confirmed", byeParticipantId: ids[0], winnerParticipantId: null, loserParticipantId: null, dependencyHoldReason: null, recoveryOutcome: "valid_bye" });
      } else if (ids.length === 0 && match.nextMatchId) {
        update(match, { status: "bye", resultStatus: "confirmed", byeParticipantId: null, winnerParticipantId: null, loserParticipantId: null, dependencyHoldReason: null, recoveryOutcome: "empty" });
      } else { conflicts.add(match.id); continue; } // Championship/bronze never invented.
      progressed = true;
    }
    if (!progressed) break;
  }
  const queue = [...conflicts];
  while (queue.length) {
    const id = queue.shift()!;
    const match = matches.find(row => row.id === id);
    if (!match) continue;
    for (const next of [match.nextMatchId, match.loserNextMatchId, match.resetMatchId]) if (typeof next === "string" && !conflicts.has(next)) { conflicts.add(next); queue.push(next); }
    const original = input.find(row => row.id === id)!;
    if (!resolved.has(String(original.status)) && original.status !== "double_forfeit_hold") {
      // Do not retain a newly planned clock/action for a dependency held below.
      changed.delete(id);
      if (original.dependencyHoldReason !== recoveryHold) changed.set(id, { ...original, status: "held", dependencyHoldReason: recoveryHold, updatedAt: now.toISOString() });
    }
  }
  return { updates: [...changed.values()], conflicts: [...conflicts].sort() };
}

/** Re-read the bounded complete graph in one transaction; repeated recovery is idempotent. */
export async function recoverIndividualTournamentBracket(db: Firestore, tournamentId: string, now = new Date()) {
  // Recovery is one bounded graph operation. Concurrent scans otherwise hold
  // shared graph locks and try to upgrade the same matches in opposite orders.
  // A durable lease coalesces duplicate delivery without retrying failed work.
  const leaseRef = db.collection("tournamentRecoveryLeases").doc(tournamentId), owner = randomUUID();
  const acquired = await db.runTransaction(async transaction => {
    const lease = await transaction.get(leaseRef);
    if (Number(lease.data()?.expiresAtMs ?? 0) > Date.now()) return false;
    transaction.set(leaseRef, { tournamentId, owner, expiresAtMs: Date.now() + 120_000 });
    return true;
  });
  if (!acquired) return { updated: 0, conflicts: [] as string[], status: "recovery_in_progress" };
  try {
  return await db.runTransaction(async transaction => {
    const ref = db.collection("tournaments").doc(tournamentId);
    const [lease, tournament] = await transaction.getAll(leaseRef, ref);
    if (lease.data()?.owner !== owner || Number(lease.data()?.expiresAtMs ?? 0) <= Date.now()) throw new Error("TOURNAMENT_RECOVERY_LEASE_EXPIRED");
    if (!tournament.exists || !isIndividualTournamentPolicy(tournament.data()!) || !["active", "round_active", "under_review"].includes(String(tournament.data()?.status))) return { updated: 0, conflicts: [] as string[] };
    // Do not leave sibling query streams using an aborted transaction ID.
    // Let the SDK retry the whole transaction after the first read failure.
    const matches = await transaction.get(db.collection("tournamentMatches").where("tournamentId", "==", tournamentId).limit(131));
    const participants = await transaction.get(db.collection("tournamentParticipants").where("tournamentId", "==", tournamentId).limit(65));
    const rounds = await transaction.get(db.collection("tournamentRounds").where("tournamentId", "==", tournamentId).limit(65));
    const exceptions = await transaction.get(db.collection("tournamentExceptions").where("tournamentId", "==", tournamentId).limit(131));
    if (matches.size > 130 || participants.size > 64 || rounds.size > 64 || exceptions.size > 130) throw new Error("TOURNAMENT_RECOVERY_GRAPH_LIMIT");
    const rows = (docs: FirebaseFirestore.QueryDocumentSnapshot[]): Row[] => docs.map(doc => ({ ...doc.data(), id: doc.id }));
    const participantRows = rows(participants.docs);
    const accountIds = [...new Set(participantRows.map(row => String(row.userId ?? "")).filter(id => id && !id.includes("/")))];
    const accounts = accountIds.length ? await transaction.getAll(...accountIds.map(id => db.collection("users").doc(id))) : [];
    const accountMap = new Map(accounts.map(row => [row.id, row]));
    const checkedParticipants = participantRows.map(row => {
      const account = accountMap.get(String(row.userId));
      return { ...row, recoveryAccountReview: !account?.exists || account.data()?.disabled === true || account.data()?.suspended === true || ["suspended", "disabled", "deleted", "deactivated", "blocked", "deletion_requested", "anonymized"].includes(String(account.data()?.accountStatus)) };
    });
    const plan = planIndividualBracketRecovery({ ...tournament.data(), id: tournamentId }, rows(matches.docs), checkedParticipants, now);
    if (Number(lease.data()?.expiresAtMs ?? 0) <= Date.now()) throw new Error("TOURNAMENT_RECOVERY_LEASE_EXPIRED");
    const openedRounds = new Set(plan.updates.filter(row => row.status === "submissions_open").map(row => row.roundId));
    for (const row of plan.updates) {
      transaction.set(db.collection("tournamentMatches").doc(row.id), row, { merge: true });
      transaction.set(db.collection("tournamentAuditEvents").doc(`${row.id}_recovery_${row.status}`), { tournamentId, actorId: "system_tournament_lifecycle", action: row.status === "submissions_open" ? "match_assigned" : "bracket_recovery", createdAt: now.toISOString(), metadata: { matchId: row.id, outcome: row.recoveryOutcome ?? row.status, targetCompetitorIds: [row.participantAId, row.participantBId].filter(Boolean) } });
    }
    for (const round of rounds.docs) if (openedRounds.has(round.id)) transaction.set(round.ref, { status: "active", startsAt: round.data().startsAt ?? now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    if (plan.conflicts.length) transaction.set(db.collection("tournamentExceptions").doc(`${tournamentId}_recovery`), { tournamentId, type: "bracket_recovery", status: "open", affectedMatchIds: plan.conflicts, reason: recoveryHold, updatedAt: now.toISOString() }, { merge: true });
    else for (const exception of exceptions.docs) if (exception.data().status === "open" && ["bracket_recovery", "double_forfeit_dependency_hold"].includes(String(exception.data().type))) transaction.update(exception.ref, { status: "resolved", resolution: "Verified unambiguous graph recovery; no match victory or loss fabricated.", resolvedAt: now.toISOString() });
    return { updated: plan.updates.length, conflicts: plan.conflicts };
  });
  } finally {
    await db.runTransaction(async transaction => {
      const lease = await transaction.get(leaseRef);
      if (lease.data()?.owner === owner) transaction.delete(leaseRef);
    });
  }
}
