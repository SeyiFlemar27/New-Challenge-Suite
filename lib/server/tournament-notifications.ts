import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

const events: Record<string, { title: string; message: string; category: string; competition?: boolean }> = {
  individual_match_hold: { title: "Affected Tournament progression held", message: "An authorized evidence review holds only the affected matches and related financial releases. Unrelated competition continues; no results were invented.", category: "challengeReminders", competition: true },
  individual_match_confirm_existing_result: { title: "Affected match review concluded", message: "The existing verified result was confirmed without inventing a new outcome. Review the restored deadlines and any independently remaining holds.", category: "challengeReminders", competition: true },
  cancel: { title: "Tournament cancelled", message: "The authorized cancellation is recorded. Any eligible entry refund remains subject to provider confirmation; no completed refund is implied.", category: "challengeReminders", competition: true },
  individual_entry_withdrawn: { title: "Tournament withdrawal recorded", message: "Your entry withdrawal is recorded. Check the authoritative entry and any pending refund separately.", category: "challengeReminders" },
  individual_review_overdue: { title: "Affected match review escalated", message: "The affected review was escalated. Scoped progression and financial holds remain until an authorized resolution.", category: "challengeReminders", competition: true },
  individual_structural_review: { title: "Bracket dependency review updated", message: "Admin recorded an evidence-based structural review. Existing legitimate losses are preserved; unresolved dependencies remain held.", category: "challengeReminders", competition: true },
  competitor_disqualified: { title: "Tournament entry disqualified", message: "Admin recorded an evidence-backed disqualification. Review your entry and any affected progression or financial hold. Existing payment history is preserved.", category: "challengeReminders", competition: true },
  individual_settlement_prepared: { title: "Tournament prize credits recorded", message: "Verified results and funding created internal prize credits. Clearance and withdrawal checks still apply. No external payout was executed.", category: "billingAlerts", competition: true },
  match_assigned: { title: "Match assigned — submission window open", message: "Your next match is assigned. Submit fresh content before the full server-recorded deadline shown in Match Details.", category: "challengeReminders", competition: true },
  competitor_advanced: { title: "Tournament progression verified", message: "Your verified result advanced your competition path. Check the bracket for your next assignment or final placement review.", category: "challengeReminders", competition: true },
  competitor_eliminated: { title: "Tournament elimination verified", message: "The verified match outcome concluded this competition path. Check official results; prize status remains separately reviewed.", category: "challengeReminders", competition: true },
  paid_entry_slot_reserved: { title: "Entry checkout reservation created", message: "A temporary checkout reservation is recorded. It is not confirmed registration or payment; review its expiration in registration details.", category: "billingAlerts" },
  tournament_entry_payment_review_required: { title: "Entry payment requires reconciliation", message: "Payment did not establish eligible registration. The provider reference and required return or review remain recorded; no refund is claimed complete.", category: "billingAlerts" },
  tournament_entry_payment_disputed: { title: "Tournament entry payment disputed", message: "A provider dispute was linked to this entry. Affected competition and financial operations require reconciliation.", category: "billingAlerts" },
  tournament_entry_refunded_and_held: { title: "Entry refund verified — competition hold recorded", message: "The verified refund outcome changed entry eligibility. Review the affected bracket and financial reconciliation state.", category: "billingAlerts" },
  participant_registered: { title: "Tournament registration confirmed", message: "Your registration occupies a confirmed slot. Activation waits for verified full capacity.", category: "challengeReminders" },
  submitted_for_review: { title: "Tournament submitted for review", message: "The saved Tournament is awaiting Admin review. Registration has not opened yet.", category: "challengeReminders" },
  tournament_approve: { title: "Tournament approved", message: "Admin approved this Tournament and registration is open.", category: "challengeReminders" },
  tournament_reject: { title: "Tournament changes requested", message: "Admin requested changes. Review the recorded decision before resubmitting.", category: "challengeReminders" },
  team_slot_reserved: { title: "Team registration confirmed", message: "The verified team now occupies a bracket slot. Check activation and match assignment status.", category: "challengeReminders" },
  submission_submitted: { title: "Match submission received", message: "The official submission is stored and awaits required moderation. Submission is not approval.", category: "challengeReminders" },
  submission_replaced: { title: "Match submission replaced", message: "A replacement revision was stored. Previous review history is preserved; inspect the current moderation status.", category: "challengeReminders" },
  submission_approved: { title: "Match submission approved", message: "The current submission was approved. Voting still waits for the full submission window and both required approvals.", category: "challengeReminders", competition: true },
  submission_rejected: { title: "Match submission requires attention", message: "A moderation decision was recorded. Review the authoritative decision and remaining deadline in Match Details.", category: "challengeReminders", competition: true },
  no_submission_extension: { title: "Match submission window extended", message: "The one-time twelve-hour extension was recorded. Use the persisted deadline in Match Details.", category: "challengeReminders", competition: true },
  double_forfeit_dependency_hold: { title: "Match progression under review", message: "The submission outcome requires review. Dependent progression is held; no winner was fabricated.", category: "challengeReminders", competition: true },
  submission_forfeit: { title: "Match forfeit verified", message: "The deadline outcome and permitted progression were recorded. Review the bracket for the verified outcome.", category: "challengeReminders", competition: true },
  match_voting_closed: { title: "Match voting closed", message: "Voting ended. The result remains provisional until complete verification succeeds.", category: "voteNotifications", competition: true },
  tournament_settlement_prepared: { title: "Tournament prize allocation prepared", message: "Admin approved official placements and prepared internal prize entitlements. Holds and withdrawal checks still apply; no external payment is confirmed by this notification.", category: "billingAlerts", competition: true },
  team_entitlements_reconciled: { title: "Team prize eligibility reviewed", message: "Admin recorded an evidence-backed entitlement decision. Review the current allocation or hold; completed payouts were preserved.", category: "billingAlerts" },
  pause: { title: "Tournament paused", message: "The Tournament is paused. Check its authoritative state before taking further competition actions.", category: "challengeReminders", competition: true },
  resume: { title: "Tournament resumed", message: "The Tournament resumed. Review the current match deadlines before participating.", category: "challengeReminders", competition: true },
  paid_tournament_entry_confirmed: { title: "Tournament registration confirmed", message: "Your entry payment was verified and your registration is confirmed. Check the Tournament for its capacity and activation state.", category: "billingAlerts" },
  full_tournament_activated: { title: "Tournament activated", message: "Verified capacity is full. Your bracket and match submission windows are available.", category: "challengeReminders", competition: true },
  match_voting_opened: { title: "Match voting is open", message: "The submission window and required moderation are complete. Check the authoritative voting deadline on your match.", category: "voteNotifications", competition: true },
  result_confirmed: { title: "Match result verified", message: "A match result and its advancement have been verified. Check your bracket for the next match or final review status.", category: "challengeReminders", competition: true },
  team_member_payment_attempt_started: { title: "Team registration started", message: "Your captain locked a registration roster. Each member must complete their own applicable payment within the team window.", category: "billingAlerts" },
  team_member_payment_confirmed: { title: "Team payment received", message: "Your payment was verified. Team registration remains pending until every required member payment is confirmed.", category: "billingAlerts" },
  team_registration_confirmed: { title: "Team registration confirmed", message: "Every required member payment is confirmed and the team occupies a verified bracket slot.", category: "challengeReminders" },
  team_registration_failed: { title: "Team registration requires attention", message: "The registration attempt could not complete. Existing payments remain recorded for authorized reconciliation.", category: "billingAlerts" },
  team_registration_expired: { title: "Team registration window expired", message: "This attempt no longer reserves a bracket slot. Review the team and any payment reconciliation status before retrying.", category: "billingAlerts" },
  team_entry_payment_review_required: { title: "Entry payment under review", message: "A payment needs reconciliation and has not been accepted as confirmed registration.", category: "billingAlerts" },
  sponsor_payment_confirmed: { title: "Sponsorship funding verified", message: "Eligible Sponsor prize funding was recorded once. Branding and eventual award release remain separately reviewed.", category: "sponsorRequestUpdates" },
  sponsor_payment_review_required: { title: "Sponsorship payment requires review", message: "A successful payment was not accepted into the prize pool. Its review case and provider references are preserved.", category: "billingAlerts" },
  sponsor_terms_accept: { title: "Tournament sponsorship terms accepted", message: "The organizer accepted the recorded agreement version. Sponsor acceptance and eligible provider-confirmed payment are still required.", category: "sponsorRequestUpdates" },
  sponsor_terms_reject: { title: "Tournament sponsorship interest rejected", message: "The organizer recorded a decision on the proposed agreement. Review its status in your Sponsor workspace.", category: "sponsorRequestUpdates" },
};
const hostEvents = new Set(["individual_match_hold", "individual_match_confirm_existing_result","cancel", "individual_review_overdue", "individual_structural_review","full_tournament_activated", "submitted_for_review", "tournament_approve", "tournament_reject", "double_forfeit_dependency_hold", "pause", "resume", "team_entitlements_reconciled", "tournament_settlement_prepared", "individual_settlement_prepared"]);
const actorEvents = new Set(["individual_entry_withdrawn","participant_registered", "paid_entry_slot_reserved", "paid_tournament_entry_confirmed", "submission_submitted", "submission_replaced", "team_slot_reserved", "team_member_payment_attempt_started", "team_member_payment_confirmed", "team_registration_confirmed", "team_registration_failed", "team_registration_expired", "team_entry_payment_review_required", "sponsor_terms_accept", "sponsor_terms_reject"]);
const participantBroadcasts = new Set(["cancel","full_tournament_activated", "pause", "resume", "tournament_settlement_prepared", "individual_settlement_prepared"]);

/** Audit events are the durable source; delivery state never mutates audit history. */
export async function deliverTournamentNotifications(db: Firestore, tournamentId: string) {
  const [tournament, audits, participants, teams, deliveries] = await Promise.all([
    db.collection("tournaments").doc(tournamentId).get(), db.collection("tournamentAuditEvents").where("tournamentId", "==", tournamentId).get(),
    db.collection("tournamentParticipants").where("tournamentId", "==", tournamentId).get(), db.collection("tournamentTeams").where("tournamentId", "==", tournamentId).get(),
    db.collection("tournamentNotificationDeliveries").where("tournamentId", "==", tournamentId).get(),
  ]);
  if (!tournament.exists) return { delivered: 0 };
  const hostId = String(tournament.data()?.hostId ?? "");
  let delivered = 0;
  const completed = new Set(deliveries.docs.filter(row => row.data().status === "completed").map(row => row.id));
  for (const audit of audits.docs.filter(row => !completed.has(row.id))) {
    const source = audit.data(), policy = events[String(source.action)];
    if (!policy) continue;
    const metadata = source.metadata ?? {};
    const action = String(source.action);
    const recipients = new Set<string>(hostEvents.has(action) ? [hostId] : []);
    const add = (value: unknown) => { if (typeof value === "string" && value && !/^(system_|stripe$)/.test(value)) recipients.add(value); };
    if (actorEvents.has(action)) add(source.actorId);
    add(metadata.payerUserId); add(metadata.sponsorUserId);
    if (typeof metadata.paymentId === "string") {
      const payment = await db.collection("tournamentEntryPayments").doc(metadata.paymentId).get();
      if (payment.data()?.tournamentId === tournamentId) add(payment.data()?.userId);
    }
    if (Array.isArray(metadata.rosterUserIds)) metadata.rosterUserIds.forEach(add);
    const matchId = typeof metadata.matchId === "string" ? metadata.matchId : null;
    const match = matchId ? await db.collection("tournamentMatches").doc(matchId).get() : null;
    const affectedIds = Array.isArray(metadata.affectedMatchIds) ? [...new Set<string>(metadata.affectedMatchIds.filter((value: unknown): value is string => typeof value === "string" && Boolean(value) && !value.includes("/")))].slice(0, 130) : [];
    const affected = affectedIds.length ? await db.getAll(...affectedIds.map(value => db.collection("tournamentMatches").doc(value))) : [];
    const affectedCompetitors = affected.filter(row => row.data()?.tournamentId === tournamentId).flatMap(row => [row.data()?.participantAId, row.data()?.participantBId]);
    const competitorIds = Array.isArray(metadata.targetCompetitorIds) ? metadata.targetCompetitorIds : match ? [match.data()?.participantAId, match.data()?.participantBId] : [];
    if (affectedCompetitors.length) competitorIds.push(...affectedCompetitors);
    const targeted = Boolean(matchId) || Array.isArray(metadata.targetCompetitorIds) || affectedIds.length > 0;
    participants.docs.filter(row => policy.competition && (targeted ? competitorIds.includes(row.id) : participantBroadcasts.has(action) && ["registered", "active", "eliminated", "winner", "completed"].includes(String(row.data().status)))).forEach(row => add(row.data().userId));
    teams.docs.filter(row => (policy.competition && (targeted ? competitorIds.includes(row.id) : participantBroadcasts.has(action) && ["ready", "registered", "active", "eliminated", "winner", "completed"].includes(String(row.data().status)))) || row.id === metadata.teamId).forEach(row => {
      if (Array.isArray(row.data().memberUserIds)) row.data().memberUserIds.forEach(add);
    });
    const users = [...recipients].filter(Boolean).sort();
    const deliveryRef = db.collection("tournamentNotificationDeliveries").doc(audit.id);
    for (;;) {
      const progress = await db.runTransaction(async transaction => {
        const state = await transaction.get(deliveryRef);
        if (state.data()?.status === "completed") return { done: true, count: 0 };
        // Freeze recipient ordering on first delivery; later roster edits cannot
        // shift a saved cursor and silently skip or duplicate recipients.
        const recipientIds: string[] = state.exists && Array.isArray(state.data()?.recipientIds) ? state.data()!.recipientIds : users;
        const cursor = Number(state.data()?.cursor ?? 0);
        const page = recipientIds.slice(cursor, cursor + 32);
        const refs = page.map(userId => ({ userId, ref: db.collection("notifications").doc(createHash("sha256").update(`tournament:${audit.id}:${userId}`).digest("hex")) }));
        const existing = refs.length ? await transaction.getAll(...refs.map(row => row.ref)) : [];
        const emails = refs.length ? await transaction.getAll(...refs.map(row => db.collection("tournamentEmailOutbox").doc(row.ref.id))) : [];
        const preferences = refs.length ? await transaction.getAll(...refs.map(row => db.collection("notificationPreferences").doc(row.userId))) : [];
        const now = new Date().toISOString(); let count = 0;
        refs.forEach((row, index) => {
          const preference = preferences[index].data() ?? {};
          if (preference.email === true && preference[policy.category] !== false && !emails[index].exists) transaction.create(db.collection("tournamentEmailOutbox").doc(row.ref.id), { tournamentId, userId: row.userId, sourceEventId: audit.id, title: policy.title, message: policy.message, category: policy.category, status: "pending", createdAt: now, recipientDeliveryVerified: false });
          if (existing[index].exists) return;
          const actionUrl = /sponsor/.test(String(source.action)) && row.userId !== hostId ? "/sponsor/dashboard" : matchId ? `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}` : `/tournaments/${encodeURIComponent(tournamentId)}`;
          transaction.create(row.ref, { id: row.ref.id, userId: row.userId, type: `tournament_${source.action}`, title: policy.title, message: policy.message, body: policy.message, status: "unread", read: false, actionUrl, entityType: "tournament", entityId: tournamentId, targetId: tournamentId, delivery: { inApp: true, email: false, push: false }, metadata: { sourceEventId: audit.id, tournamentId }, createdAt: now, updatedAt: now }); count++;
        });
        const done = cursor + page.length >= recipientIds.length;
        transaction.set(deliveryRef, { tournamentId, sourceEventId: audit.id, recipientIds, cursor: cursor + page.length, status: done ? "completed" : "pending", emailDeliveryStatus: "not_enabled", updatedAt: now }, { merge: true });
        return { done, count };
      });
      delivered += progress.count;
      if (progress.done) break;
    }
  }
  return { delivered };
}

/** Financial/competition commits survive delivery outages; audit events remain
 * eligible for the authenticated reconciler. Never report an email as sent. */
export async function attemptTournamentNotifications(db: Firestore, tournamentId: string) {
  try {
    const notices = await deliverTournamentNotifications(db, tournamentId);
    const { deliverTournamentEmailOutbox } = await import("@/lib/server/normal-email");
    const email = await deliverTournamentEmailOutbox(db, tournamentId);
    return { status: "in_app_processed", ...notices, email: email.enabled ? "provider_processing" : "not_enabled" };
  }
  catch { return { status: "pending_recovery", delivered: 0, email: "not_enabled" }; }
}
