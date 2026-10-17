import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

type Decision = "eligible" | "temporary_hold" | "permanently_ineligible";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cents = (value: unknown) => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw new Error("TEAM_ENTITLEMENT_AMOUNT_INVALID"); return n; };
const completedPayment = (data: Record<string, unknown>) => data.externalPayoutExecuted === true || data.paid === true || ["paid", "paid_out", "completed", "succeeded"].includes(String(data.status)) || ["paid", "paid_out", "completed", "succeeded"].includes(String(data.payoutStatus)) || cents(data.withdrawnAmountCents ?? 0) > 0;

/** Only the recent-authenticated, confirmed Admin handler may call this service.
 * Revisions change canonical unpaid credits, never execute or reverse a payout.
 * Historical credit snapshots are retained in each immutable revision record.
 */
export async function reconcileTournamentTeamEntitlements(db: Firestore, input: {
  tournamentId: string; teamId: string; userId: string; decision: Decision;
  adminId: string; reason: string; evidenceReference: string; expectedVersion: number; idempotencyKey: string;
}) {
  if (!input.adminId || input.reason.trim().length < 5 || input.evidenceReference.trim().length < 5
      || !["eligible", "temporary_hold", "permanently_ineligible"].includes(input.decision)
      || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !/^[\w-]{8,100}$/.test(input.idempotencyKey)) throw new Error("TEAM_ELIGIBILITY_EVIDENCE_REQUIRED");
  const fingerprint = hash(input);
  const revisionRef = db.collection("tournamentEntitlementRevisions").doc(hash([input.tournamentId, input.teamId, input.idempotencyKey]));
  const teamRef = db.collection("tournamentTeams").doc(input.teamId);
  const tournamentRef = db.collection("tournaments").doc(input.tournamentId);
  return db.runTransaction(async tx => {
    const [prior, teamSnap, tournamentSnap] = await tx.getAll(revisionRef, teamRef, tournamentRef);
    if (prior.exists) { if (prior.data()?.requestFingerprint !== fingerprint) throw new Error("TEAM_ENTITLEMENT_IDEMPOTENCY_CONFLICT"); return { idempotent: true, version: prior.data()?.version, status: prior.data()?.status }; }
    const team = teamSnap.data() ?? {}, tournament = tournamentSnap.data() ?? {};
    const roster: string[] = Array.isArray(team.memberUserIds) ? [...new Set<string>(team.memberUserIds)] : [];
    if (!teamSnap.exists || !tournamentSnap.exists || team.tournamentId !== input.tournamentId || tournament.participationMode !== "team" || !team.rosterLockedAt || !roster.includes(input.userId)) throw new Error("TEAM_LOCKED_ROSTER_REQUIRED");
    const version = Number(team.entitlementVersion ?? 0);
    if (version !== input.expectedVersion) throw new Error("TEAM_ENTITLEMENT_VERSION_STALE");
    const decisions: Record<string, Decision> = { ...(team.memberEligibilityDecisions ?? {}), [input.userId]: input.decision };
    // Existing authoritative exclusions remain excluded until explicitly corrected.
    const excluded = new Set<string>(Array.isArray(team.disqualifiedMemberUserIds) ? team.disqualifiedMemberUserIds : []);
    if (input.decision === "permanently_ineligible") excluded.add(input.userId);
    else excluded.delete(input.userId);
    const eligible = roster.filter(uid => !excluded.has(uid));
    const settlementId = typeof tournament.settlementId === "string" ? tournament.settlementId : null;
    const credits = await tx.get(db.collection("cashLedger").where("challengeId", "==", input.tournamentId));
    const affected = credits.docs.filter(row => row.data().teamId === input.teamId && row.data().settlementId === settlementId && row.data().direction === "credit");
    const wallets = await Promise.all(roster.map(uid => tx.get(db.collection("cashWallets").doc(uid))));
    const accounts = await Promise.all(roster.map(uid => tx.get(db.collection("users").doc(uid))));
    const withdrawals = await Promise.all(affected.map(row => tx.get(db.collection("withdrawalRequests").where("sourceIds", "array-contains", row.id))));
    const settlement = settlementId ? await tx.get(db.collection("challengeSettlements").doc(settlementId)) : null;
    if (settlementId && (!settlement?.exists || settlement.data()?.settlementEntityType !== "tournament")) throw new Error("TEAM_SETTLEMENT_EVIDENCE_REQUIRED");
    const holdRef = db.collection("tournamentSettlementHolds").doc(hash([input.tournamentId, input.teamId, "eligibility"]));
    const previousHold = await tx.get(holdRef);
    const unsafe = affected.some((row, index) => {
      const data = row.data();
      return !["pending_review", "pending_hold", "ineligible"].includes(String(data.status)) || completedPayment(data)
        || !roster.includes(String(data.userId)) || String(data.currency).toUpperCase() !== "USD"
        || !["challenge_winner_prize", "sponsor_prize"].includes(String(data.sourceType))
        || data.disputeRestricted === true || data.financialRestriction && data.financialRestriction !== "team_eligibility_review"
        || cents(data.reservedAmountCents ?? 0) > 0 || cents(data.withdrawnAmountCents ?? 0) > 0
        || cents(data.feeAmountCents ?? 0) > 0
        || withdrawals[index].docs.some(request => !["cancelled", "failed", "rejected"].includes(String(request.data().status)));
    }) || tournament.financialHold === true || tournament.settlementRestricted === true || settlement?.data()?.disputeRestricted === true;
    const groups = new Map<string, typeof affected>();
    for (const row of affected) { const key = `${row.data().sourceType}:${row.data().placement}`; groups.set(key, [...(groups.get(key) ?? []), row]); }
    if ([...groups.values()].some(rows => new Set(rows.map(row => row.data().userId)).size !== rows.length)) throw new Error("TEAM_LEDGER_RECONCILIATION_REQUIRED");
    const now = new Date().toISOString();
    const updates: { id: string; before: Record<string, unknown>; after: Record<string, unknown> }[] = [];
    const delta = new Map(roster.map(uid => [uid, { pending: 0, locked: 0, lifetime: 0 }]));
    const status = unsafe ? "recovery_review_required" : eligible.length ? settlementId ? "reconciled_unpaid" : "eligibility_recorded" : "no_eligible_recipients_hold";
    for (const rows of groups.values()) {
      const total = rows.reduce((sum, row) => sum + cents(row.data().netAmountCents), 0);
      const template = rows[0].data();
      const byUser = new Map(rows.map(row => [String(row.data().userId), row]));
      // Recovery cases keep all historical amounts and completed payouts intact.
      if (unsafe || !eligible.length) {
        for (const row of rows) if (!completedPayment(row.data()) && ["pending_review", "pending_hold", "available"].includes(String(row.data().status))) updates.push({ id: row.id, before: row.data(), after: { ...row.data(), financialRestriction: row.data().financialRestriction || "team_eligibility_review", teamEligibilityRestricted: true, entitlementVersion: version + 1, updatedAt: now } });
        continue;
      }
      for (const uid of roster) {
        const previous = byUser.get(uid), before = previous?.data() ?? {};
        const position = eligible.indexOf(uid);
        const amount = position < 0 ? 0 : Math.floor(total / eligible.length) + (position < total % eligible.length ? 1 : 0);
        const account = accounts[roster.indexOf(uid)].data() ?? {};
        const hold = decisions[uid] === "temporary_hold" || account.payoutHold === true || account.withdrawalRestricted === true || account.accountStatus === "suspended";
        const id = previous?.id ?? hash([settlementId, input.teamId, template.sourceType, template.placement, uid]);
        const after = { ...template, ...before, id, walletCreditId: id, userId: uid, grossAmountCents: amount, netAmountCents: amount, amountCents: amount,
          status: amount === 0 ? "ineligible" : hold ? "pending_hold" : "pending_review", balanceBucket: hold ? "locked" : "pending", financialRestriction: null,
          availableAmountCents: 0, reservedAmountCents: 0, teamEligibilityRestricted: false, entitlementVersion: version + 1, memberCount: eligible.length, allocationOrder: roster.indexOf(uid),
          createdAt: before.createdAt ?? now, updatedAt: now };
        const change = delta.get(uid)!;
        const old = previous ? cents(before.netAmountCents) : 0;
        if (previous) { if (before.balanceBucket === "locked") change.locked -= old; else change.pending -= old; }
        if (hold) change.locked += amount; else change.pending += amount;
        change.lifetime += amount - old;
        updates.push({ id, before, after });
      }
    }
    // Verify every wallet before the first write, avoiding partial financial state.
    const walletUpdates = roster.map((uid, index) => {
      const before = wallets[index].data() ?? {}, change = delta.get(uid)!;
      const pending = cents(before.pendingBalanceCents ?? 0) + change.pending, locked = cents(before.lockedBalanceCents ?? 0) + change.locked, lifetime = cents(before.lifetimeEarningsCents ?? 0) + change.lifetime;
      if (pending < 0 || locked < 0 || lifetime < 0) throw new Error("TEAM_WALLET_RECONCILIATION_REQUIRED");
      return { uid, pending, locked, lifetime, changed: change.pending !== 0 || change.locked !== 0 || change.lifetime !== 0 };
    });
    for (const update of updates) tx.set(db.collection("cashLedger").doc(update.id), update.after);
    for (const wallet of walletUpdates) if (wallet.changed) tx.set(db.collection("cashWallets").doc(wallet.uid), { userId: wallet.uid, currency: "USD", pendingBalanceCents: wallet.pending, lockedBalanceCents: wallet.locked, lifetimeEarningsCents: wallet.lifetime, updatedAt: now }, { merge: true });
    tx.update(teamRef, { memberEligibilityDecisions: decisions, disqualifiedMemberUserIds: [...excluded], entitlementVersion: version + 1, entitlementStatus: status, updatedAt: now });
    tx.create(revisionRef, { tournamentId: input.tournamentId, teamId: input.teamId, settlementId, version: version + 1, previousVersion: version, requestFingerprint: fingerprint,
      actorId: input.adminId, reason: input.reason, evidenceReference: input.evidenceReference, userId: input.userId, decision: input.decision, eligibleUserIds: eligible, status, changes: updates,
      providerPayoutExecuted: false, completedPayoutsPreserved: true, createdAt: now });
    tx.create(db.collection("tournamentAuditEvents").doc(revisionRef.id), { tournamentId: input.tournamentId, actorId: input.adminId, action: "team_entitlements_reconciled", reason: input.reason, createdAt: now, metadata: { teamId: input.teamId, version: version + 1, status, rosterUserIds: roster, revisionId: revisionRef.id } });
    tx.create(db.collection("auditLogs").doc(revisionRef.id), { actorId: input.adminId, actorType: "admin", action: "tournament.team_entitlements_reconciled", targetId: input.tournamentId, reason: input.reason, before: { entitlementVersion: version, memberEligibilityDecisions: team.memberEligibilityDecisions ?? {} }, after: { entitlementVersion: version + 1, memberEligibilityDecisions: decisions, status }, metadata: { teamId: input.teamId, settlementId, revisionId: revisionRef.id, evidenceReference: input.evidenceReference, providerPayoutExecuted: false }, createdAt: now });
    if (unsafe || !eligible.length) tx.set(holdRef, { tournamentId: input.tournamentId, teamId: input.teamId, settlementId, status: "pending_admin_review", reason: status, revisionId: revisionRef.id, amountCents: affected.filter(row => !completedPayment(row.data())).reduce((sum, row) => sum + cents(row.data().netAmountCents), 0), currency: "USD", completedPayoutsPreserved: true, updatedAt: now }, { merge: true });
    else if (previousHold.exists) tx.update(holdRef, { status: "resolved", resolvedBy: input.adminId, resolutionRevisionId: revisionRef.id, resolvedAt: now, updatedAt: now });
    return { idempotent: false, version: version + 1, status };
  });
}
