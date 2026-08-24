import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { adminTournamentActionFoundation } from "@/lib/server/tournament-operations";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import { canPauseTournament } from "@/lib/server/tournament-lifecycle";
import type { TournamentFoundation, TournamentRoundPlanItem, TournamentStatus } from "@/lib/tournament-types";
import { tournamentPlacementFingerprint } from "@/lib/server/tournament-settlement";

export const dynamic = "force-dynamic";

const TOURNAMENT_DATE_FIELDS = ["registrationOpensAt", "registrationClosesAt", "checkInClosesAt", "tournamentStartsAt", "expectedEndAt"] as const;
const ROUND_DATE_FIELDS = ["startsAt", "endsAt", "votingOpensAt", "votingClosesAt"] as const;
const PLAN_DATE_FIELDS = ["submissionOpensAt", "submissionDeadlineAt", "votingOpensAt", "votingClosesAt"] as const;

function shiftedIso(value: unknown, durationMs: number) {
  if (typeof value !== "string" || !value) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() + durationMs).toISOString() : value;
}

function shiftedDates(source: Record<string, unknown>, fields: readonly string[], durationMs: number) {
  return Object.fromEntries(fields.map((field) => [field, shiftedIso(source[field], durationMs)]));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament management actions");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").slice(0, 500);
  const { id } = await context.params;
  const tournamentRef = db.collection("tournaments").doc(id);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, { id: tournamentSnap.id, ...tournamentSnap.data() }, ["host", "manager", "moderator"]);
  if (!permission.allowed) return fail("Tournament management permission is required.", 403, permission, "TOURNAMENT_MANAGER_REQUIRED");
  const foundation = adminTournamentActionFoundation(action);
  if (!action) return fail("Tournament action is required.", 400, undefined, "TOURNAMENT_ACTION_REQUIRED");
  if (["schedule_change", "pause", "cancel", "resume", "participant_removed", "submission_rejected", "dispute_resolved"].includes(action) && reason.length < 5) return fail("A reason is required for sensitive tournament actions.", 400, foundation, "TOURNAMENT_ACTION_REASON_REQUIRED");
  const now = new Date().toISOString();
  if (action === "review_final_placements") {
    const placementsSnap = await db.collection("tournamentPlacements").where("tournamentId", "==", id).get();
    const placements = placementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).filter((item) => [1, 2, 3].includes(Number(item.placement)));
    if (!placements.some((item) => Number(item.placement) === 1)) return fail("Competition-derived final placements are not ready for review.", 409, undefined, "TOURNAMENT_OFFICIAL_PLACEMENTS_REQUIRED");
    const fingerprint = tournamentPlacementFingerprint(placements);
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(tournamentRef);
      if (!fresh.exists || !["under_review", "final"].includes(String(fresh.data()?.status ?? ""))) throw new Error("TOURNAMENT_RESULTS_NOT_READY");
      transaction.set(tournamentRef, { creatorPlacementReviewFingerprint: fingerprint, creatorPlacementReviewedAt: now, creatorPlacementReviewedBy: user.uid, creatorPlacementReviewStatus: "ready_for_admin_finalization", updatedAt: now }, { merge: true });
      transaction.set(db.collection("tournamentAuditEvents").doc(`${id}_placements_reviewed_${fingerprint}`), { id: `${id}_placements_reviewed_${fingerprint}`, tournamentId: id, actorId: user.uid, action: "competition_placements_reviewed", reason: reason || "Competition-derived placements reviewed without changes.", createdAt: now, metadata: { placementFingerprint: fingerprint, placementIds: placements.map((item) => item.id), creatorCannotReplaceBracketWinners: true } }, { merge: true });
    });
    return ok({ action, placementFingerprint: fingerprint, status: "ready_for_admin_finalization", payoutProviderCalled: false }, "Competition-derived placements are ready for Admin finalization.");
  }
  if (action === "pause" || action === "resume") {
    const roundSnaps = action === "resume" ? await db.collection("tournamentRounds").where("tournamentId", "==", id).get() : null;
    const outcome = await db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(tournamentRef);
      if (!currentSnap.exists) return { ok: false as const, code: "TOURNAMENT_NOT_FOUND", message: "Tournament not found." };
      const current = { id: currentSnap.id, ...currentSnap.data() } as TournamentFoundation & { pausedAt?: string | null; pausedFromStatus?: TournamentStatus | null; totalPausedMs?: number };
      if (action === "pause") {
        if (current.status === "paused") return { ok: true as const, idempotent: true, status: current.status, pausedAt: current.pausedAt ?? null };
        if (!canPauseTournament(current.status)) return { ok: false as const, code: "TOURNAMENT_PAUSE_NOT_ALLOWED", message: "This tournament can no longer be paused." };
        transaction.set(tournamentRef, { status: "paused", pausedAt: now, pausedFromStatus: current.status, updatedAt: now }, { merge: true });
        transaction.set(db.collection("tournamentAuditEvents").doc(`${id}_pause_${now}`), { id: `${id}_pause_${now}`, tournamentId: id, actorId: user.uid, action: "pause", reason, createdAt: now, metadata: { previousStatus: current.status } });
        return { ok: true as const, idempotent: false, status: "paused", pausedAt: now };
      }
      if (current.status !== "paused" || !current.pausedAt || !current.pausedFromStatus) return { ok: false as const, code: "TOURNAMENT_NOT_PAUSED", message: "This tournament is not currently paused." };
      const durationMs = Math.max(0, new Date(now).getTime() - new Date(current.pausedAt).getTime());
      const roundPlan = Array.isArray(current.roundPlan)
        ? current.roundPlan.map((round) => ({ ...round, ...shiftedDates(round as unknown as Record<string, unknown>, PLAN_DATE_FIELDS, durationMs) } as TournamentRoundPlanItem))
        : [];
      transaction.set(tournamentRef, {
        status: current.pausedFromStatus,
        ...shiftedDates(current as unknown as Record<string, unknown>, TOURNAMENT_DATE_FIELDS, durationMs),
        roundPlan,
        pausedAt: null,
        pausedFromStatus: null,
        totalPausedMs: Number(current.totalPausedMs ?? 0) + durationMs,
        updatedAt: now
      }, { merge: true });
      roundSnaps?.docs.forEach((roundSnap) => transaction.set(roundSnap.ref, { ...shiftedDates(roundSnap.data(), ROUND_DATE_FIELDS, durationMs), updatedAt: now }, { merge: true }));
      transaction.set(db.collection("tournamentAuditEvents").doc(`${id}_resume_${now}`), { id: `${id}_resume_${now}`, tournamentId: id, actorId: user.uid, action: "resume", reason, createdAt: now, metadata: { restoredStatus: current.pausedFromStatus, durationMs } });
      return { ok: true as const, idempotent: false, status: current.pausedFromStatus, durationMs };
    });
    if (!outcome.ok) return fail(outcome.message, outcome.code === "TOURNAMENT_NOT_FOUND" ? 404 : 409, foundation, outcome.code);
    return ok({ action, ...outcome, auditRequired: true, payoutProviderCalled: false }, outcome.idempotent ? "Tournament was already paused." : action === "pause" ? "Tournament paused." : "Tournament resumed and scheduled deadlines were shifted.");
  }
  await db.collection("tournamentAuditEvents").doc(`${id}_${action}_${now}`).set({ id: `${id}_${action}_${now}`, tournamentId: id, actorId: user.uid, action, reason, createdAt: now, metadata: { foundation } });
  return ok({ action, auditRequired: foundation.auditRequired, payoutProviderCalled: false, balanceOverwriteAllowed: false, rawVoteTotalEditable: false }, "Tournament management action recorded as an audited foundation event.");
}
