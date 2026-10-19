import { challengeReviewBuilderDestination } from "@/lib/notification-navigation";
import { createHash } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { buildChallengeApprovalUpdate, buildChallengeRejectionUpdate } from "@/lib/server/challenge-lifecycle";
import { prepareEnterpriseActiveChallengeRelease } from "@/lib/server/enterprise-active-challenge-limit";
import { seedLiveEventJobs } from "@/lib/server/live-event-job-outbox";
import { wakeNormalLifecycleJob } from "@/lib/server/normal-lifecycle-outbox";
import { verifyChallengeMedia } from "@/lib/server/media-verification";

export class ChallengeAdminReviewError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export function reviewKind(record: Record<string, unknown>, source = "challenges") {
  return source === "tournaments" ? "tournament" : record.isLiveEvent ? "live_event" : ["private", "exclusive"].includes(String(record.visibility)) ? "private" : "normal";
}
export function reviewState(record: Record<string, unknown>) {
  if (record.status === "pending_review") return "pending_review";
  if (record.adminApprovalStatus === "rejected" || record.reviewStatus === "rejected") return "rejected";
  if (record.reviewStatus === "changes_requested" || record.status === "changes_requested") return "changes_requested";
  if (record.adminApprovalStatus === "approved" || record.reviewStatus === "approved") return "approved";
  return String(record.status ?? "draft");
}
/** Stable document cursors scan both canonical collections. A bounded scan always exposes continuation, never a false empty queue. */
export async function listChallengeReviews(db: Firestore, input: { cursor?: string; kind?: string; status?: string; search?: string; direction?: string }) {
  let positions: Record<string, string> = {};
  if (input.cursor) { try { positions = JSON.parse(Buffer.from(input.cursor, "base64url").toString()); } catch { throw new ChallengeAdminReviewError("REVIEW_CURSOR_INVALID", 422); } }
  if (!positions || typeof positions !== "object" || Array.isArray(positions) || Object.keys(positions).some(key => !["challenges", "tournaments"].includes(key))) throw new ChallengeAdminReviewError("REVIEW_CURSOR_INVALID", 422);
  if (Object.values(positions).some(value => typeof value !== "string" || value.length > 1500 || value.includes("/"))) throw new ChallengeAdminReviewError("REVIEW_CURSOR_INVALID", 422);
  const rows: Record<string, unknown>[] = []; const next: Record<string, string> = {}; let hasMore = false;
  for (const source of ["challenges", "tournaments"]) {
    if (positions[source] === "!done") { next[source] = "!done"; continue; }
    let last = positions[source]; let complete = false;
    for (let page = 0; page < 10; page++) {
      let query = db.collection(source).orderBy(FieldPath.documentId(), input.direction === "desc" ? "desc" : "asc").limit(25);
      if (last) query = query.startAfter(last);
      const snap = await query.get();
      for (const doc of snap.docs) {
        const record = doc.data(), kind = reviewKind(record, source), state = reviewState(record);
        if (input.kind && input.kind !== "all" && input.kind !== kind) continue;
        if (input.status && input.status !== "all" && input.status !== state) continue;
        if (input.search && !`${record.title ?? ""} ${record.creatorName ?? record.hostName ?? ""} ${record.creatorId ?? record.hostId ?? ""} ${doc.id}`.toLowerCase().includes(input.search.toLowerCase())) continue;
        rows.push({ id: doc.id, source, kind, title: record.title ?? "Untitled", status: state, lifecycleStatus: record.status, creatorId: record.creatorId ?? record.hostId ?? null, creatorName: record.creatorName ?? record.hostName ?? "", submittedAt: record.submittedForReviewAt ?? record.submittedAt ?? null, updatedAt: record.updatedAt ?? null });
      }
      last = snap.docs.at(-1)?.id ?? last;
      complete = snap.size < 25;
      if (complete || rows.length >= 25) break;
    }
    next[source] = complete ? "!done" : last ?? "!done"; hasMore ||= !complete;
  }
  return { rows, nextCursor: hasMore ? Buffer.from(JSON.stringify(next)).toString("base64url") : null, scanComplete: !hasMore };
}

export async function decideChallengeReview(db: Firestore, input: { id: string; actorId: string; action: string; reason?: string; expectedUpdatedAt?: unknown }) {
  if (!["approve", "reject", "request_changes"].includes(input.action)) throw new ChallengeAdminReviewError("REVIEW_ACTION_INVALID", 422);
  const reason = String(input.reason ?? "").trim();
  if (input.action !== "approve" && reason.length < 8) throw new ChallengeAdminReviewError("REVIEW_REASON_REQUIRED", 422);
  const ref = db.collection("challenges").doc(input.id), now = new Date().toISOString();
  let recoveredMedia: Record<string, unknown> | null = null;
  let recoveredVersion: unknown;
  if (input.action === "approve") {
    const [submission, verification] = await Promise.all([ref.get(), db.collection("challengeMediaVerifications").doc(input.id).get()]);
    const data = submission.data() ?? {};
    if (data.status === "pending_review" && verification.data()?.status !== "verified" && data.mediaVerification?.status === "verified") {
      // Older submissions could commit before the separate verification write failed.
      // Reinspect real immutable bytes; embedded/client metadata alone never authorizes approval.
      try { recoveredMedia = await verifyChallengeMedia(db, input.id, data, String(data.creatorId ?? data.hostId ?? "")); recoveredVersion = data.updatedAt; }
      catch { throw new ChallengeAdminReviewError("REVIEW_MEDIA_NOT_VERIFIED"); }
    }
  }
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref); if (!snap.exists) throw new ChallengeAdminReviewError("CHALLENGE_NOT_FOUND", 404);
    const current = snap.data() ?? {};
    if ([current.creatorId, current.hostId, current.ownerId].includes(input.actorId)) throw new ChallengeAdminReviewError("SELF_REVIEW_PROHIBITED", 403);
    const revision = String(current.reviewRevisionId ?? current.currentReviewRevision ?? current.reviewRevisionNumber ?? current.submittedForReviewAt ?? "initial");
    const decisionId = createHash("sha256").update(`${input.id}:${revision}:${input.action}`).digest("hex");
    const historyRef = db.collection("challengeReviewDecisions").doc(decisionId), previous = await tx.get(historyRef);
    if (previous.exists && current.lastReviewDecisionId === decisionId) return { idempotent: true, status: current.status };
    if (current.status !== "pending_review" || current.adminReviewRequired !== true) throw new ChallengeAdminReviewError("REVIEW_STATE_CHANGED");
    if (input.expectedUpdatedAt !== undefined && current.updatedAt !== input.expectedUpdatedAt) throw new ChallengeAdminReviewError("REVIEW_STATE_CHANGED");
    const approved = input.action === "approve";
    if (approved) {
      const verification = await tx.get(db.collection("challengeMediaVerifications").doc(input.id));
      if ((!verification.exists || verification.data()?.status !== "verified") && !recoveredMedia) throw new ChallengeAdminReviewError("REVIEW_MEDIA_NOT_VERIFIED");
      if (recoveredMedia && current.updatedAt !== recoveredVersion) throw new ChallengeAdminReviewError("REVIEW_STATE_CHANGED");
      if (current.builderVersion === "normal_v3" || (current.isLiveEvent && current.hostOperations?.schemaVersion === 2)) {
        const funding = await tx.get(db.collection("creatorPrizeFundingPayments").where("challengeId", "==", input.id));
        const required = Math.round(Number(current.prizeValue ?? 0) * 100);
        const confirmed = funding.docs.reduce((total, doc) => { const payment = doc.data(); const amount = Number(payment.amountCents); const owned = current.organizationOwnerId ? payment.organizationOwnerId === current.organizationOwnerId : payment.userId === current.creatorId && !payment.organizationOwnerId; return owned && Number.isSafeInteger(amount) && amount > 0 && payment.status === "confirmed" && payment.webhookConfirmed === true && payment.paymentPurpose === "prize_pool_funding" && !payment.settlementRestricted && payment.refundLiabilityStatus !== "pending" && String(payment.currency).toUpperCase() === "USD" ? total + amount : total; }, 0);
        if (!Number.isSafeInteger(required) || !Number.isSafeInteger(confirmed) || required < 0 || (current.builderVersion === "normal_v3" && required > 0 && required < 500) || confirmed < required) throw new ChallengeAdminReviewError("CREATOR_PRIZE_FUNDING_REQUIRED");
      }
    }
    const release = !approved ? await prepareEnterpriseActiveChallengeRelease(db, tx, String(current.organizationOwnerId ?? "") || null, input.id) : { apply: () => undefined };
    const update: Record<string, unknown> = approved ? buildChallengeApprovalUpdate(current, input.actorId, now) : input.action === "reject" ? buildChallengeRejectionUpdate(input.actorId, now) : { status: "changes_requested", lifecycleStatus: "changes_requested", adminReviewRequired: true, updatedAt: now, reviewedBy: input.actorId, reviewedAt: now };
    Object.assign(update, { reviewStatus: approved ? "approved" : input.action === "reject" ? "rejected" : "changes_requested", reviewReason: reason || "Approved after reviewing the submitted challenge.", lastReviewDecisionId: decisionId });
    if (!approved) Object.assign(update, { adminApprovalStatus: input.action === "reject" ? "rejected" : "changes_requested", publicVisibility: false });
    else update.publicVisibility = current.visibility === "private" ? current.publicPreviewEnabled === true : true;
    if (current.isLiveEvent) {
      if (approved) Object.assign(update, { status: "scheduled", lifecycleStatus: "scheduled" });
      Object.assign(update, { eventApprovalStatus: approved ? "approved" : input.action === "reject" ? "rejected" : "changes_requested", eventVisibility: approved ? "public" : "hidden_until_approved", eventSyncStatus: approved ? "synced" : "pending_review" });
      if (approved && current.hostOperations?.schemaVersion === 2 && !current.sponsorFundingCutoffAt) update.sponsorFundingCutoffAt = current.startsAt;
      tx.set(db.collection("liveEvents").doc(input.id), { ...current, ...update, id: input.id, challengeId: input.id, status: approved ? "scheduled" : update.status, eventApprovalStatus: update.eventApprovalStatus, hostOperations: current.hostOperations ?? {}, updatedAt: now }, { merge: true });
      if (approved && current.hostOperations?.schemaVersion === 2) seedLiveEventJobs(db, tx, input.id, current);
    }
    tx.set(ref, update, { merge: true }); release.apply();
    if (recoveredMedia) tx.set(db.collection("challengeMediaVerifications").doc(input.id), recoveredMedia);
    if (current.normalLifecyclePolicyVersion === 1) wakeNormalLifecycleJob(db, tx, input.id, now);
    const decision = { challengeId: input.id, revision, action: input.action, actorId: input.actorId, reason: update.reviewReason, before: { status: current.status }, after: { status: update.status }, createdAt: now };
    tx.create(historyRef, decision); tx.create(db.collection("auditLogs").doc(`challenge_review_${decisionId}`), { ...decision, actorType: "admin", targetId: input.id, action: `challenge.${input.action}` });
    const owner = String(current.creatorId ?? current.hostId ?? "");
    if (owner) tx.set(db.collection("notifications").doc(`challenge_review_${decisionId}`), { userId: owner, type: `challenge_${input.action}`, title: approved ? "Challenge approved" : input.action === "reject" ? "Challenge not approved" : "Changes requested", body: String(update.reviewReason), targetId: input.id, actionUrl: approved ? `${current.isLiveEvent ? "/live-events" : "/challenges"}/${encodeURIComponent(input.id)}` : challengeReviewBuilderDestination(current, input.id), read: false, delivery: { inApp: true, email: false }, createdAt: now });
    if (owner) tx.set(db.collection("normalEmailOutbox").doc(`challenge_review_${decisionId}`), { challengeId: input.id, userId: owner, sourceEventId: decisionId, title: approved ? "Challenge approved" : "Challenge review feedback", message: String(update.reviewReason), status: "pending", createdAt: now });
    return { idempotent: false, status: update.status };
  });
}
