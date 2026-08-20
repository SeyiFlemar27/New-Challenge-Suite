import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { createNotification } from "@/lib/server/notifications";
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

async function rows(db: FirebaseFirestore.Firestore, collection: string, challengeId: string, limit = 200): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(collection).where("challengeId", "==", challengeId).limit(limit).get().catch(() => null);
  return snap?.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>)) ?? [];
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
  if (access.response || !access.db || !access.challenge || !access.user) return access.response;
  const [participants, entryRequests, submissions, reports, winnerProposals, settlements, sponsorships, financialLedger, prizePoolSnap, directAudits, relatedAudits] = await Promise.all([
    rows(access.db, "challengeParticipants", id),
    rows(access.db, "challengeEntryRequests", id),
    rows(access.db, "submissions", id),
    rows(access.db, "challengeReports", id),
    rows(access.db, "winnerProposals", id, 50),
    rows(access.db, "challengeSettlements", id, 25),
    rows(access.db, "sponsorships", id, 100),
    rows(access.db, "challengeFinancialLedger", id, 200),
    access.db.collection("prizePools").doc(id).get(),
    access.db.collection("auditLogs").where("targetId", "==", id).limit(100).get().then((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))).catch(() => []),
    access.db.collection("auditLogs").where("metadata.challengeId", "==", id).limit(100).get().then((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))).catch(() => [])
  ]);
  const audits = [...new Map([...directAudits, ...relatedAudits].map((item) => [String(item.id), item])).values()]
    .sort((left, right) => String((right as Record<string, unknown>).createdAt ?? "").localeCompare(String((left as Record<string, unknown>).createdAt ?? "")));
  return ok({
    challenge: access.challenge,
    participants,
    entryRequests,
    submissions,
    reports,
    winnerProposals,
    settlements,
    sponsorships,
    financialLedger: financialLedger.map((item) => ({ id: item.id, revenueType: item.revenueType ?? null, shareType: item.shareType ?? item.sourceType ?? null, amountCents: Number(item.amountCents ?? item.netAmountCents ?? 0), currency: item.currency ?? "usd", status: item.status ?? null, createdAt: item.createdAt ?? null })),
    prizePool: prizePoolSnap.exists ? { id: prizePoolSnap.id, ...prizePoolSnap.data() } : null,
    audits,
    permissions: { isAdmin: Boolean(access.user?.isAdmin), canModerateSensitiveActions: Boolean(access.user?.isAdmin) },
    financialExecutionEnabled: false
  }, "Challenge management loaded.");
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
  const reason = String(body.reason ?? "").trim().slice(0, 1000);
  const requestedChanges = String(body.requestedChanges ?? "").trim().slice(0, 2000);
  const note = String(body.note ?? "").trim().slice(0, 1000);
  const resubmissionDeadline = String(body.resubmissionDeadline ?? "").trim();
  if (!collections[targetType] || !targetId || !action) return validationError({ action: "A supported target and action are required." });
  const allowed: Record<string, Set<string>> = {
    submission: new Set(["approve", "reject", "flag", "request_resubmission"]),
    participant: new Set(["approve", "reject", "request_info", "check_in", "request_disqualification"]),
    report: new Set(["request_review"])
  };
  if (!allowed[targetType]?.has(action)) return validationError({ action: "This management action is not supported." });
  if (["reject", "flag"].includes(action) && !reason) return validationError({ reason: action === "reject" ? "A rejection reason is required." : "A flag reason is required." });
  if (action === "request_resubmission") {
    if (!requestedChanges) return validationError({ requestedChanges: "Requested changes are required." });
    const deadline = Date.parse(resubmissionDeadline);
    if (!resubmissionDeadline || !Number.isFinite(deadline) || deadline <= Date.now()) return validationError({ resubmissionDeadline: "A future resubmission deadline is required." });
  }
  if (action === "request_info" && !reason) return validationError({ reason: "Describe the information needed from the participant." });
  if (action === "request_disqualification" && !reason) return validationError({ reason: "A disqualification reason is required for admin review." });

  const ref = access.db.collection(collections[targetType]).doc(targetId);
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.challengeId ?? "") !== id) return fail("Management record not found.", 404, undefined, "NOT_FOUND");
  const current = snap.data() ?? {};
  const now = new Date().toISOString();
  if (targetType === "participant" && action === "check_in") {
    const type = String(access.challenge.type ?? access.challenge.competitionType ?? "").toLowerCase();
    if (!access.challenge.isLiveEvent && !type.includes("live")) return fail("Check-in is available only for Live Events.", 409, undefined, "LIVE_EVENT_REQUIRED");
    const checkIn = await access.db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(ref);
      if (!currentSnap.exists || String(currentSnap.data()?.challengeId ?? "") !== id) throw new Error("PARTICIPANT_NOT_FOUND");
      if (currentSnap.data()?.checkedInAt || currentSnap.data()?.checkInStatus === "checked_in") return { alreadyCheckedIn: true, participant: currentSnap.data() ?? {} };
      const update = { checkInStatus: "checked_in", checkedInAt: now, checkedInBy: access.user.uid, updatedAt: now };
      transaction.set(ref, update, { merge: true });
      return { alreadyCheckedIn: false, participant: { ...(currentSnap.data() ?? {}), ...update } };
    });
    if (!checkIn.alreadyCheckedIn) await writeAuditLog({ actorId: access.user.uid, actorType: access.user.isAdmin ? "admin" : "creator", action: "participant.check_in", targetType: "participant", targetId, before: { checkInStatus: current.checkInStatus ?? null }, after: { checkInStatus: "checked_in", checkedInAt: now }, metadata: { challengeId: id, manualFallback: true } }, access.db);
    const participantId = String(checkIn.participant.userId ?? checkIn.participant.participantId ?? "");
    if (participantId && !checkIn.alreadyCheckedIn) await createNotification(access.db, { userId: participantId, type: "event_check_in_confirmed", title: "Event check-in confirmed", body: "Your attendance was confirmed by the event manager.", actionUrl: `/challenges/${id}`, targetId: id, idempotencyKey: `event_check_in_${id}_${targetId}` }).catch(() => undefined);
    return ok({ targetId, targetType, status: String(checkIn.participant.status ?? "approved"), action, alreadyCheckedIn: checkIn.alreadyCheckedIn }, checkIn.alreadyCheckedIn ? "Participant was already checked in." : "Participant checked in.");
  }
  let nextStatus = String(current.status ?? "pending");
  const update: Record<string, unknown> = { updatedAt: now };

  if (targetType === "submission") {
    nextStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "flag" ? "flagged" : "resubmission_requested";
    Object.assign(update, { status: nextStatus, moderationStatus: nextStatus, reviewedBy: access.user.uid, reviewedAt: now });
    if (action === "reject") Object.assign(update, { rejectionReason: reason, rejectedAt: now });
    if (action === "flag") Object.assign(update, { flagReason: reason, flaggedAt: now, publicEligible: false });
    if (action === "request_resubmission") Object.assign(update, { requestedChanges, resubmissionDeadline, resubmissionNote: note || null, resubmissionRequestedAt: now, publicEligible: false });
    if (action === "approve") Object.assign(update, { approvedAt: now, publicEligible: true, rejectionReason: null, flagReason: null });
  } else if (targetType === "participant") {
    if (action === "check_in") {
      const type = String(access.challenge.type ?? access.challenge.competitionType ?? "").toLowerCase();
      if (!access.challenge.isLiveEvent && !type.includes("live")) return fail("Check-in is available only for Live Events.", 409, undefined, "LIVE_EVENT_REQUIRED");
      nextStatus = String(current.status ?? "approved");
      Object.assign(update, { checkInStatus: "checked_in", checkedInAt: now, checkedInBy: access.user.uid });
    } else if (action === "request_disqualification") {
      nextStatus = String(current.status ?? "approved");
      Object.assign(update, { disqualificationStatus: "pending_admin_review", disqualificationReason: reason, disqualificationRequestedAt: now, disqualificationRequestedBy: access.user.uid });
    } else if (action === "request_info") {
      Object.assign(update, { informationRequestStatus: "requested", informationRequestedAt: now, informationRequest: reason });
    } else {
      nextStatus = action === "approve" ? "approved" : "rejected";
      Object.assign(update, { status: nextStatus, approvalStatus: nextStatus, reviewedBy: access.user.uid, reviewedAt: now, rejectionReason: action === "reject" ? reason : null });
    }
  } else {
    nextStatus = "pending_admin_review";
    Object.assign(update, { status: nextStatus, reason });
  }

  await ref.set(update, { merge: true });
  const participantId = String(current.userId ?? current.participantId ?? "");
  if (participantId && ["reject", "approve", "request_resubmission", "request_info", "request_disqualification"].includes(action)) {
    await createNotification(access.db, { userId: participantId, type: `${targetType}_${action}`, title: action === "approve" ? "Entry approved" : action === "reject" ? "Review update" : action === "request_resubmission" ? "Submission changes requested" : action === "request_info" ? "Information requested" : "Disqualification review requested", body: requestedChanges || reason || note || "Your competition record was updated.", actionUrl: targetType === "submission" ? `/submissions/${targetId}` : `/challenges/${id}`, targetId, idempotencyKey: `${targetType}_${targetId}_${action}_${now.slice(0, 16)}` }).catch(() => undefined);
  }
  await writeAuditLog({ actorId: access.user.uid, actorType: access.user.isAdmin ? "admin" : "creator", action: `${targetType}.${action}`, targetType, targetId, before: { status: current.status ?? null }, after: { status: nextStatus, ...update }, reason: reason || requestedChanges || null, metadata: { challengeId: id, resubmissionDeadline: resubmissionDeadline || null, note: note || null, adminReviewRequired: action === "request_disqualification" } }, access.db);
  return ok({ targetId, targetType, status: nextStatus, action, adminReviewRequired: action === "request_disqualification" }, action === "request_disqualification" ? "Disqualification request sent for admin review." : "Management action recorded.");
}
