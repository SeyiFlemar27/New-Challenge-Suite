import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const collections = {
  participant: "challengeParticipants",
  submission: "submissions",
  report: "challengeReports"
} as const;

function ownsChallenge(challenge: Record<string, unknown>, userId: string) {
  return [challenge.creatorId, challenge.ownerId, challenge.hostId, challenge.userId].some((value) => String(value ?? "") === userId);
}

async function rows(db: FirebaseFirestore.Firestore, collection: string, challengeId: string, limit = 200) {
  const snap = await db.collection(collection).where("challengeId", "==", challengeId).limit(limit).get().catch(() => null);
  return snap?.docs.map((doc) => ({ id: doc.id, ...doc.data() })) ?? [];
}

async function context(request: Request, challengeId: string) {
  const auth = await requireRequestUser(request);
  if (auth.response || !auth.user) return { response: auth.response, user: null, db: null, challenge: null };
  const db = getAdminDb();
  if (!db) return { response: serverUnavailable("Challenge management"), user: null, db: null, challenge: null };
  const snap = await db.collection("challenges").doc(challengeId).get();
  if (!snap.exists) return { response: fail("Challenge not found.", 404, undefined, "NOT_FOUND"), user: null, db: null, challenge: null };
  const challenge = { id: snap.id, ...snap.data() } as Record<string, unknown>;
  if (!auth.user.isAdmin && !ownsChallenge(challenge, auth.user.uid)) return { response: fail("Challenge management access is restricted to the owner or an admin.", 403, undefined, "FORBIDDEN"), user: null, db: null, challenge: null };
  return { response: null, user: auth.user, db, challenge };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await context(request, id);
  if (access.response || !access.db || !access.challenge) return access.response;
  const [participants, entryRequests, submissions, reports, winnerProposals, audits] = await Promise.all([
    rows(access.db, "challengeParticipants", id),
    rows(access.db, "challengeEntryRequests", id),
    rows(access.db, "submissions", id),
    rows(access.db, "challengeReports", id),
    rows(access.db, "winnerProposals", id, 50),
    access.db.collection("auditLogs").where("targetId", "==", id).limit(100).get().then((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))).catch(() => [])
  ]);
  return ok({ challenge: access.challenge, participants, entryRequests, submissions, reports, winnerProposals, audits, financialExecutionEnabled: false }, "Challenge management loaded.");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await context(request, id);
  if (access.response || !access.db || !access.challenge || !access.user) return access.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body as Record<string, unknown>;
  const targetType = String(body.targetType ?? "") as keyof typeof collections;
  const targetId = String(body.targetId ?? "");
  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  if (!collections[targetType] || !targetId || !action) return validationError({ action: "A supported target and action are required." });

  const statusMap: Record<string, Record<string, string>> = {
    participant: { mark_incomplete: "incomplete", restore: "approved", disqualify: "disqualified" },
    submission: { approve: "approved", reject: "rejected", request_changes: "needs_changes", flag: "flagged", disqualify: "disqualified" },
    report: { review: "under_review", resolve: "resolved", dismiss: "dismissed", escalate: "escalated" }
  };
  const nextStatus = statusMap[targetType]?.[action];
  if (!nextStatus) return validationError({ action: "This moderation action is not supported." });
  if (["reject", "request_changes", "flag", "disqualify", "escalate"].includes(action) && !reason) return validationError({ reason: "A reason is required for this action." });

  const lifecycle = String(access.challenge.status ?? access.challenge.lifecycleStatus ?? "").toLowerCase();
  const sensitiveAfterVoting = action === "disqualify" && ["voting_open", "voting_closed", "under_review", "winners_announced", "completed"].includes(lifecycle);
  if (sensitiveAfterVoting && !access.user.isAdmin) return fail("Admin review is required for disqualification after voting begins.", 403, { adminReviewRequired: true }, "ADMIN_REVIEW_REQUIRED");

  const ref = access.db.collection(collections[targetType]).doc(targetId);
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.challengeId ?? "") !== id) return fail("Management record not found.", 404, undefined, "NOT_FOUND");
  const now = new Date().toISOString();
  await ref.set({ status: nextStatus, moderationStatus: targetType === "submission" ? nextStatus : snap.data()?.moderationStatus ?? null, moderationReason: reason || null, reviewedBy: access.user.uid, reviewedAt: now, updatedAt: now }, { merge: true });
  await writeAuditLog({ actorId: access.user.uid, actorType: access.user.isAdmin ? "admin" : "creator", action: `${targetType}.${action}`, targetType, targetId, before: { status: snap.data()?.status ?? null }, after: { status: nextStatus }, reason: reason || null, metadata: { challengeId: id } }, access.db);
  return ok({ targetId, targetType, status: nextStatus }, "Management action recorded.");
}