import { queueInAppNotification } from "@/lib/server/notifications";
import { createHash } from "node:crypto";
import type { Firestore, QuerySnapshot } from "firebase-admin/firestore";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { verifyPersistedTournamentVotes } from "@/lib/server/tournament-vote-verification";
import { tournamentPlacementFingerprint, validateTournamentPlacementEvidence } from "@/lib/server/tournament-settlement-policy";
import { createCashWalletDefaults } from "@/lib/server/cash-wallet";
import type { TournamentMatchFoundation } from "@/lib/tournament-types";
import { deriveTournamentCorrectionImpact } from "@/lib/server/tournament-operations";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cents = (value: unknown) => { const amount = Number(value); if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("CORRECTION_AMOUNT_INVALID"); return amount; };
const paid = (row: Record<string, unknown>) => row.paid === true || row.payoutExecuted === true || row.externalPayoutExecuted === true || cents(row.withdrawnAmountCents ?? 0) > 0 || ["paid", "paid_out", "succeeded", "completed"].includes(String(row.status));

/** Called only by the confirmed, recent-authenticated existing Admin route.
 * Re-derives a terminal result from the complete persisted vote sequence. No
 * client winner/amount, vote edits, external payout or historical-policy rewrite.
 */
export async function correctIndividualPrizeResult(db: Firestore, input: { tournamentId: string; matchId: string; caseKey: string; requestKey: string; expectedVersion: number; adminId: string; reason: string; evidenceReference: string; confirmed: boolean }, now = new Date()) {
  if (!input.confirmed || !input.adminId || input.reason.trim().length < 5 || input.evidenceReference.trim().length < 5 || ![input.requestKey, input.caseKey].every(key => /^[\w-]{8,100}$/.test(key)) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("CORRECTION_EVIDENCE_REQUIRED");
  const revisionRef = db.collection("tournamentPrizeCorrections").doc(hash([input.tournamentId, input.requestKey]));
  const requestFingerprint = hash(input);
  return db.runTransaction(async tx => {
    const tournamentRef = db.collection("tournaments").doc(input.tournamentId);
    const matchRef = db.collection("tournamentMatches").doc(input.matchId);
    const reviewRef = db.collection("tournamentDisputes").doc(createHash("sha256").update(`${input.tournamentId}|${input.matchId}|${input.caseKey}`).digest("hex"));
    const [prior, tournamentSnap, matchSnap, review] = await tx.getAll(revisionRef, tournamentRef, matchRef, reviewRef);
    if (prior.exists) {
      if (prior.data()?.requestFingerprint !== requestFingerprint) throw new Error("CORRECTION_IDEMPOTENCY_CONFLICT");
      return { status: String(prior.data()?.status), idempotent: true, version: prior.data()?.version };
    }
    const tournament = { ...tournamentSnap.data(), id: input.tournamentId };
    const match = { ...matchSnap.data(), id: input.matchId } as TournamentMatchFoundation;
    if (!tournamentSnap.exists || !isIndividualTournamentPolicy(tournament) || tournamentSnap.data()?.participationMode !== "individual" || !matchSnap.exists || match.tournamentId !== input.tournamentId || match.resultMethod !== "votes" || !["confirmed", "forfeit"].includes(match.status) || !review.exists || review.data()?.status !== "open" || review.data()?.matchId !== input.matchId) throw new Error("CORRECTION_OPEN_VERIFIED_REVIEW_REQUIRED");
    if (Number(tournamentSnap.data()?.prizeCorrectionVersion ?? 0) !== input.expectedVersion) throw new Error("CORRECTION_VERSION_STALE");
    const placements = await tx.get(db.collection("tournamentPlacements").where("tournamentId", "==", input.tournamentId).limit(5));
    const matches = await tx.get(db.collection("tournamentMatches").where("tournamentId", "==", input.tournamentId).limit(131));
    const reviews = await tx.get(db.collection("tournamentDisputes").where("tournamentId", "==", input.tournamentId).limit(131));
    const credits = await tx.get(db.collection("cashLedger").where("challengeId", "==", input.tournamentId).limit(131));
    if (placements.size > 3 || matches.size > 130 || reviews.size > 130 || credits.size > 130) throw new Error("CORRECTION_RECONCILIATION_REQUIRED");
    const outcome = await verifyPersistedTournamentVotes(db, match, tx);
    if (!outcome.valid || !outcome.winnerParticipantId || !Number.isFinite(Date.parse(String(match.votingClosesAt))) || Date.parse(String(match.votingClosesAt)) > now.getTime()) throw new Error("CORRECTION_VERIFIED_RESULT_REQUIRED");
    if (outcome.totalVotes === 0) {
      const submissions = await tx.getAll(...[match.participantAId, match.participantBId].map(id => db.collection("tournamentSubmissions").doc(`${input.tournamentId}_${input.matchId}_${id}`)));
      if (submissions.some(row => !row.exists || row.data()?.status !== "approved")) throw new Error("CORRECTION_VALID_SUBMISSIONS_REQUIRED");
    }
    const winner = outcome.winnerParticipantId, loser = winner === match.participantAId ? match.participantBId : match.participantAId;
    const correctedMatch = { ...match, status: "confirmed", resultStatus: "confirmed", winnerParticipantId: winner, loserParticipantId: loser };
    const changedResult = winner !== match.winnerParticipantId;
    // A changed upstream result cannot silently substitute a competitor in a
    // played match or invalidate a Grand Final reset. It needs structural review.
    if (changedResult && (match.nextMatchId || match.loserNextMatchId || match.resetMatchId || (review.data()?.affectedMatchIds ?? []).some((id: string) => id !== match.id))) {
      const impact = deriveTournamentCorrectionImpact(matches.docs.map(row => ({ ...row.data(), id: row.id })) as unknown as TournamentMatchFoundation[], match.id);
      const affectedIds = new Set(impact.affectedMatchIds);
      const affectedMatches = matches.docs.filter(row => affectedIds.has(row.id));
      const affectedPlacements = placements.docs.filter(row => affectedIds.has(String(row.data().sourceMatchId)));
      const positions = new Set(affectedPlacements.map(row => Number(row.data().placement)));
      const affectedCredits = credits.docs.filter(row => ["challenge_winner_prize", "sponsor_prize"].includes(String(row.data().sourceType)) && positions.has(Number(row.data().placement)));
      const participantIds = [...new Set(affectedMatches.flatMap(row => [row.data().participantAId, row.data().participantBId]).filter((id): id is string => typeof id === "string" && Boolean(id) && !id.includes("/")))];
      const participants = participantIds.length ? await tx.getAll(...participantIds.map(id => db.collection("tournamentParticipants").doc(id))) : [];
      const withdrawals = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const credit of affectedCredits) {
        const rows = await tx.get(db.collection("withdrawalRequests").where("sourceIds", "array-contains", credit.id).limit(101));
        if (rows.size > 100) throw new Error("CORRECTION_WITHDRAWAL_RECONCILIATION_REQUIRED");
        for (const row of rows.docs) withdrawals.set(row.id, row);
      }
      const status = "awaiting_competitive_policy";
      const proposal = {
        revisionId: revisionRef.id, originalResult: review.data()?.snapshots?.find((row: { id: string }) => row.id === match.id) ?? matchSnap.data(), proposedResult: { winnerParticipantId: winner, loserParticipantId: loser, evidence: outcome },
        affectedMatches: affectedMatches.map(row => ({ ...row.data(), id: row.id })), participants: participants.map(row => ({ id: row.id, userId: row.data()?.userId ?? null, status: row.data()?.status ?? null, legitimateLossCount: row.data()?.lossCount ?? 0 })),
        affectedPlacements: affectedPlacements.map(row => ({ ...row.data(), id: row.id })), financialConsequences: affectedCredits.map(row => ({ creditId: row.id, userId: row.data().userId ?? null, currency: row.data().currency ?? null, amountCents: row.data().netAmountCents ?? null, balanceBucket: row.data().balanceBucket ?? null, manualRecoveryRequired: paid(row.data()), externalPayoutReversed: false })),
        policyConflict: "CORRECTION_DOWNSTREAM_REPLAY_POLICY_REQUIRED", proposedBy: input.adminId, reason: input.reason, evidenceReference: input.evidenceReference, createdAt: now.toISOString(), resultsApplied: false
      };
      for (const row of affectedMatches) tx.update(row.ref, { reviewRestricted: true, ...(["confirmed", "forfeit", "bye", "completed"].includes(String(row.data().status)) ? { resultStatus: "under_review" } : { status: "held" }), updatedAt: now.toISOString() });
      for (const row of affectedPlacements) tx.update(row.ref, { correctionReviewRestricted: true, correctionReviewCaseId: review.id, updatedAt: now.toISOString() });
      for (const credit of affectedCredits) {
        tx.update(credit.ref, { disputeRestricted: true, financialRestriction: credit.data().financialRestriction || "INDIVIDUAL_MATCH_REVIEW", updatedAt: now.toISOString() });
        if (paid(credit.data())) tx.set(db.collection("tournamentSettlementHolds").doc(`${review.id}_${credit.id}`), { tournamentId: input.tournamentId, caseId: review.id, creditId: credit.id, status: "manual_recovery_required", reason: input.reason, externalPayoutReversed: false, updatedAt: now.toISOString() }, { merge: true });
      }
      for (const row of withdrawals.values()) if (!["paid", "paid_out", "succeeded", "completed", "cancelled", "failed", "rejected"].includes(String(row.data().status))) tx.update(row.ref, { financialHold: true, riskStatus: "held", tournamentReviewCaseIds: [...new Set([...(row.data().tournamentReviewCaseIds ?? []), review.id])], updatedAt: now.toISOString() });
      tx.update(reviewRef, { status: "open", competitivePolicyRequired: true, correctionReviewStatus: status, correctionProposal: proposal, affectedMatchIds: [...affectedIds], affectedCreditIds: affectedCredits.map(row => row.id), updatedAt: now.toISOString() });
      tx.create(revisionRef, { tournamentId: input.tournamentId, matchId: match.id, caseId: review.id, status, version: input.expectedVersion, requestFingerprint, actorId: input.adminId, reason: input.reason, evidenceReference: input.evidenceReference, proposal, externalPayoutExecuted: false, externalPayoutReversed: false, createdAt: now.toISOString() });
      tx.create(db.collection("auditLogs").doc(revisionRef.id), { actorId: input.adminId, actorType: "admin", action: "tournament.upstream_correction_policy_hold", targetId: input.tournamentId, caseId: review.id, status, reason: input.reason, evidenceReference: input.evidenceReference, createdAt: now.toISOString() });
      for (const userId of new Set(participants.map(row => String(row.data()?.userId ?? "")).filter(Boolean))) queueInAppNotification(db, tx, { eventId: `tournament_upstream_review_${revisionRef.id}`, userId, type: "tournament_result_review", title: "Affected Tournament results under review", message: "An evidence-backed correction requires review of affected progression and financial releases. Historical match records are preserved; no replacement outcome or payout was invented.", actionUrl: `/tournaments/${input.tournamentId}/matches/${input.matchId}`, createdAt: now.toISOString() });
      return { status, idempotent: false, version: input.expectedVersion };
    }
    if (placements.size !== 3) throw new Error("CORRECTION_RECONCILIATION_REQUIRED");
    const originalPlacements = placements.docs.map(row => ({ ...row.data(), id: row.id } as Record<string, unknown> & { id: string }));
    const nextPlacements = originalPlacements.map(row => row.sourceMatchId !== match.id ? row : { ...row, participantId: Number(row.placement) === 1 ? winner : Number(row.placement) === 2 ? loser : tournamentSnap.data()?.format === "single_elimination" ? winner : loser });
    const placementMatches = new Map(matches.docs.map(row => [row.id, { ...row.data(), id: row.id }]));
    placementMatches.set(match.id, correctedMatch);
    if (nextPlacements.some(row => !validateTournamentPlacementEvidence(tournament, row, placementMatches.get(String(row.sourceMatchId)) ?? {}))) throw new Error("CORRECTION_PLACEMENT_SOURCE_INVALID");
    const participantIds = [...new Set([...nextPlacements.map(row => String(row.participantId)), String(match.participantAId), String(match.participantBId)])];
    const participants = await tx.getAll(...participantIds.map(id => db.collection("tournamentParticipants").doc(id)));
    if (participants.some(row => !row.exists || row.data()?.tournamentId !== input.tournamentId || ["disqualified", "withdrawn", "rejected"].includes(String(row.data()?.status)))) throw new Error("CORRECTION_RECIPIENT_INELIGIBLE");
    const recipientMap = new Map(participants.map(row => [row.id, String(row.data()?.userId ?? "")]));
    const placementUsers = nextPlacements.map(row => recipientMap.get(String(row.participantId)));
    if (new Set(placementUsers).size !== 3 || placementUsers.some(id => !id)) throw new Error("CORRECTION_RECIPIENT_INVALID");
    for (const row of nextPlacements) row.userId = recipientMap.get(String(row.participantId));
    const settlementId = String(tournamentSnap.data()?.settlementId ?? "");
    if (!settlementId || settlementId.includes("/")) throw new Error("CORRECTION_SETTLEMENT_REQUIRED");
    const settlement = await tx.get(db.collection("challengeSettlements").doc(settlementId));
    if (!settlement.exists || settlement.data()?.challengeId !== input.tournamentId) throw new Error("CORRECTION_SETTLEMENT_REQUIRED");
    const affected = credits.docs.filter(row => row.data().settlementId === settlementId && ["challenge_winner_prize", "sponsor_prize"].includes(String(row.data().sourceType)) && cents(row.data().netAmountCents) > 0 && nextPlacements.some(p => p.sourceMatchId === match.id && Number(p.placement) === Number(row.data().placement)));
    if (!affected.length) throw new Error("CORRECTION_CREDITS_REQUIRED");
    if (reviews.docs.some(row => row.id !== review.id && row.data().status === "open" && (row.data().affectedCreditIds ?? []).some((id: string) => affected.some(credit => credit.id === id)))) throw new Error("CORRECTION_OTHER_REVIEW_OPEN");
    const withdrawals: QuerySnapshot[] = [];
    for (const credit of affected) withdrawals.push(await tx.get(db.collection("withdrawalRequests").where("sourceIds", "array-contains", credit.id).limit(101)));
    if (withdrawals.some(rows => rows.size > 100)) throw new Error("CORRECTION_WITHDRAWAL_RECONCILIATION_REQUIRED");
    const users = [...new Set([...affected.map(row => String(row.data().userId)), ...recipientMap.values()])];
    if (users.some(id => !id || id.includes("/"))) throw new Error("CORRECTION_RECIPIENT_INVALID");
    const wallets = await tx.getAll(...users.map(id => db.collection("cashWallets").doc(id)));
    const accounts = await tx.getAll(...users.map(id => db.collection("users").doc(id)));
    const held = tournamentSnap.data()?.financialHold === true || settlement.data()?.disputeRestricted === true || affected.some((row, index) => paid(row.data()) || row.data().stripeDisputeRestricted === true || row.data().financialRestriction && !["INDIVIDUAL_MATCH_REVIEW", "INDIVIDUAL_PRIZE_CORRECTION"].includes(String(row.data().financialRestriction)) || cents(row.data().reservedAmountCents ?? 0) > 0 || !["pending_review", "pending_hold", "available"].includes(String(row.data().status)) || withdrawals[index].docs.some(request => !["cancelled", "failed", "rejected"].includes(String(request.data().status))));
    const status = held ? "manual_recovery_required" : "corrected_unreleased";
    const changes: Array<Record<string, unknown>> = [];
    const walletRows = new Map(users.map((id, index) => [id, { ...createCashWalletDefaults(id, now.toISOString()), ...wallets[index].data() }]));
    const adjust = (userId: string, bucket: string, delta: number) => {
      const wallet = walletRows.get(userId)!;
      const key = bucket === "available" ? "availableBalanceCents" : bucket === "locked" ? "lockedBalanceCents" : "pendingBalanceCents";
      wallet[key] = cents(wallet[key]) + delta;
      wallet.lifetimeEarningsCents = cents(wallet.lifetimeEarningsCents) + delta;
      if (!Number.isSafeInteger(wallet[key]) || wallet[key] < 0 || wallet.lifetimeEarningsCents < 0) throw new Error("CORRECTION_WALLET_RECONCILIATION_REQUIRED");
    };
    if (!held) for (const credit of affected) {
      const before = credit.data(), placement = nextPlacements.find(row => Number(row.placement) === Number(before.placement))!;
      const recipient = recipientMap.get(String(placement.participantId))!;
      const account = accounts[users.indexOf(recipient)].data();
      const recipientWallet = walletRows.get(recipient)!;
      if (!account || account.disabled === true || account.suspended === true || account.financialRestriction || account.financialHold === true || account.payoutHold === true || wallets[users.indexOf(recipient)].data()?.financialRestriction || recipientWallet.status === "locked" || ["blocked", "disabled", "suspended", "deleted", "deactivated"].includes(String(account.accountStatus))) throw new Error("CORRECTION_RECIPIENT_HELD");
      const amount = cents(before.netAmountCents);
      if (String(before.currency).toUpperCase() !== "USD" || cents(before.feeAmountCents ?? 0) !== 0 || !["pending", "locked", "available"].includes(String(before.balanceBucket))) throw new Error("CORRECTION_LEDGER_RECONCILIATION_REQUIRED");
      if (recipient === before.userId) continue;
      adjust(String(before.userId), String(before.balanceBucket), -amount);
      adjust(recipient, "pending", amount);
      const newId = hash([revisionRef.id, credit.id, recipient]);
      const after = { ...before, id: newId, walletCreditId: newId, userId: recipient, participantId: placement.participantId, status: "pending_review", balanceBucket: "pending", availableAmountCents: 0, reservedAmountCents: 0, disputeRestricted: false, financialRestriction: null, automaticIndividual: true, correctionRevisionId: revisionRef.id, replacesCreditId: credit.id, createdAt: now.toISOString(), holdUntil: new Date(now.getTime() + 72 * 3_600_000).toISOString(), updatedAt: now.toISOString() };
      changes.push({ creditId: credit.id, newId, before, after, amountCents: amount });
    }
    // Every read, amount and wallet validation precedes all writes.
    if (held) {
      for (const credit of affected) tx.update(credit.ref, { disputeRestricted: true, financialRestriction: credit.data().financialRestriction || "INDIVIDUAL_PRIZE_CORRECTION", updatedAt: now.toISOString() });
      for (const rows of withdrawals) for (const request of rows.docs) if (!paid(request.data()) && !["cancelled", "failed", "rejected"].includes(String(request.data().status))) tx.update(request.ref, { financialHold: true, riskStatus: "held", correctionRevisionId: revisionRef.id, updatedAt: now.toISOString() });
      tx.set(db.collection("tournamentSettlementHolds").doc(revisionRef.id), { tournamentId: input.tournamentId, matchId: match.id, affectedCreditIds: affected.map(row => row.id), status, reason: input.reason, evidenceReference: input.evidenceReference, externalPayoutReversed: false, createdAt: now.toISOString() });
    } else {
      for (const change of changes) {
        tx.update(db.collection("cashLedger").doc(String(change.creditId)), { status: "corrected", netAmountCents: 0, amountCents: 0, grossAmountCents: 0, availableAmountCents: 0, disputeRestricted: true, financialRestriction: "SUPERSEDED_BY_AUDITED_CORRECTION", correctionRevisionId: revisionRef.id, updatedAt: now.toISOString() });
        tx.create(db.collection("cashLedger").doc(String(change.newId)), change.after as Record<string, unknown>);
      }
      for (const credit of affected) if (!changes.some(change => change.creditId === credit.id) && credit.data().financialRestriction === "INDIVIDUAL_MATCH_REVIEW") tx.update(credit.ref, { disputeRestricted: false, financialRestriction: null, updatedAt: now.toISOString() });
      const changedUsers = new Set(changes.flatMap(change => [String((change.before as Record<string, unknown>).userId), String((change.after as Record<string, unknown>).userId)]));
      for (const userId of changedUsers) tx.set(db.collection("cashWallets").doc(userId), { ...walletRows.get(userId), updatedAt: now.toISOString() });
      tx.update(matchRef, { winnerParticipantId: winner, loserParticipantId: loser, resultStatus: "confirmed", reviewRestricted: false, resultCorrectionVersion: Number(matchSnap.data()?.resultCorrectionVersion ?? 0) + 1, updatedAt: now.toISOString() });
      if (changedResult) for (const participant of participants.filter(row => [winner, loser].includes(row.id))) {
        const delta = participant.id === match.loserParticipantId ? -1 : participant.id === loser ? 1 : 0;
        const losses = cents(participant.data()?.lossCount ?? 0) + delta;
        if (losses < 0) throw new Error("CORRECTION_LOSS_RECONCILIATION_REQUIRED");
        tx.update(participant.ref, { lossCount: losses, ...(nextPlacements.find(row => Number(row.placement) === 1)?.participantId === participant.id ? { status: "winner" } : losses >= (tournamentSnap.data()?.format === "double_elimination" ? 2 : 1) ? { status: "eliminated" } : {}), updatedAt: now.toISOString() });
      }
      for (const placement of nextPlacements) tx.set(db.collection("tournamentPlacements").doc(placement.id), { ...placement, userId: recipientMap.get(String(placement.participantId)), correctionRevisionId: revisionRef.id }, { merge: true });
      const fingerprint = tournamentPlacementFingerprint(nextPlacements, tournamentSnap.data()?.productPolicyVersion);
      const remap = (rows: unknown) => Array.isArray(rows) ? rows.map(row => ({ ...row, userId: recipientMap.get(String(nextPlacements.find(p => Number(p.placement) === Number(row.placement))?.participantId)) ?? row.userId })) : [];
      tx.update(settlement.ref, { winnerDistribution: remap(settlement.data()?.winnerDistribution), sponsorPrizeDistribution: remap(settlement.data()?.sponsorPrizeDistribution), placementFingerprint: fingerprint, correctionVersion: input.expectedVersion + 1, updatedAt: now.toISOString() });
      tx.update(tournamentRef, { settlementPlacementFingerprint: fingerprint, prizeCorrectionVersion: input.expectedVersion + 1, updatedAt: now.toISOString() });
      tx.update(reviewRef, { status: "resolved", resolution: "verified_result_and_unreleased_credits_corrected", resolvedBy: input.adminId, resolvedAt: now.toISOString(), correctionRevisionId: revisionRef.id });
      if (review.data()?.escalatedAt) tx.set(db.collection("tournamentReviewEscalations").doc(review.id), { status: "resolved", resolvedBy: input.adminId, resolvedAt: now.toISOString(), correctionRevisionId: revisionRef.id }, { merge: true });
    }
    tx.create(revisionRef, { tournamentId: input.tournamentId, matchId: match.id, settlementId, status, version: held ? input.expectedVersion : input.expectedVersion + 1, requestFingerprint, actorId: input.adminId, reason: input.reason, evidenceReference: input.evidenceReference, originalMatch: matchSnap.data(), originalPlacements, changes, verifiedOutcome: outcome, externalPayoutExecuted: false, externalPayoutReversed: false, createdAt: now.toISOString() });
    tx.create(db.collection("auditLogs").doc(revisionRef.id), { actorId: input.adminId, actorType: "admin", action: "tournament.prize_correction", targetId: input.tournamentId, status, reason: input.reason, evidenceReference: input.evidenceReference, revisionId: revisionRef.id, createdAt: now.toISOString() });
    const notificationUsers = new Set((held ? affected.flatMap(row => [row.data().userId, recipientMap.get(String(nextPlacements.find(p => Number(p.placement) === Number(row.data().placement))?.participantId))]) : changes.flatMap(change => [(change.before as Record<string, unknown>).userId, (change.after as Record<string, unknown>).userId])).filter((uid): uid is string => typeof uid === "string" && Boolean(uid)));
    for (const userId of notificationUsers) queueInAppNotification(db, tx, { eventId: `tournament_prize_correction_${revisionRef.id}`, userId, type: "financial_correction", title: held ? "Prize correction requires recovery review" : "Internal prize correction recorded", message: held ? "Affected credits and releases remain held for authorized recovery. Withdrawn funds were not silently reversed." : "Verified placements and unreleased internal prize credits were reconciled. Wallet clearance and withdrawal checks still apply; no external payout was executed.", actionUrl: "/wallet", createdAt: now.toISOString() });
    return { status, idempotent: false, version: held ? input.expectedVersion : input.expectedVersion + 1 };
  });
}
