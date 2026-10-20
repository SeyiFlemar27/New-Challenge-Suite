import { FieldPath, type Firestore } from "firebase-admin/firestore";

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

export async function decideChallengeReview(_db: Firestore, _input: { id: string; actorId: string; action: string; reason?: string; expectedUpdatedAt?: unknown }): Promise<never> {
  throw new ChallengeAdminReviewError("EDITORIAL_APPROVAL_RETIRED", 410);
}
