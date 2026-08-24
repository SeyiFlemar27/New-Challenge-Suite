import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { cleanMoneyCents, cleanText, isoNow, normalizeProposalDeliverables, proposalAcceptanceState } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

async function creatorCanAccess(db: FirebaseFirestore.Firestore, proposal: Record<string, unknown>, userId: string) {
  if (proposal.linkedCreatorId === userId) return true;
  const challengeId = String(proposal.linkedChallengeId ?? "");
  if (!challengeId) return false;
  const snap = await db.collection("challenges").doc(challengeId).get();
  const challenge = snap.data() ?? {};
  return [challenge.creatorId, challenge.ownerId, challenge.hostId, challenge.createdBy].includes(userId);
}

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const auth = await requireRequestUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator sponsorship proposal");
  const { proposalId } = await params;
  const snap = await db.collection("sponsorProposals").doc(proposalId).get();
  if (!snap.exists) return fail("Proposal not found.", 404, undefined, "NOT_FOUND");
  const proposal = snap.data() ?? {};
  if (!(await creatorCanAccess(db, proposal, auth.user.uid))) return fail("You do not have access to this proposal.", 403, undefined, "PERMISSION_DENIED");
  const revisions = await db.collection("sponsorProposalRevisions").where("proposalId", "==", proposalId).limit(50).get();
  const revisionItems: Array<Record<string, unknown> & { id: string }> = revisions.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return ok({ proposal: { id: snap.id, ...proposal }, revisions: revisionItems.sort((a, b) => Number(a.revisionNumber ?? 0) - Number(b.revisionNumber ?? 0)) }, "Sponsorship proposal loaded.");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const auth = await requireRequestUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator sponsorship proposal");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const action = cleanText(body.action).toLowerCase();
  if (!["view", "accept", "decline", "request_changes", "counter"].includes(action)) return validationError({ action: "Choose an available proposal response." });
  const { proposalId } = await params;
  const initial = await db.collection("sponsorProposals").doc(proposalId).get();
  if (!initial.exists) return fail("Proposal not found.", 404, undefined, "NOT_FOUND");
  if (!(await creatorCanAccess(db, initial.data() ?? {}, auth.user.uid))) return fail("You do not have access to this proposal.", 403, undefined, "PERMISSION_DENIED");
  const expectedVersion = Number(body.expectedVersion ?? initial.data()?.version ?? 0);
  try {
    let updated: Record<string, unknown> | null = null;
    await db.runTransaction(async (transaction) => {
      const ref = db.collection("sponsorProposals").doc(proposalId);
      const snap = await transaction.get(ref);
      const proposal = snap.data() ?? {};
      if (Number(proposal.version ?? 0) !== expectedVersion) throw new Error("PROPOSAL_VERSION_CONFLICT");
      const status = String(proposal.status ?? "");
      if (!["sent", "viewed", "received", "under_review", "negotiating", "changes_requested"].includes(status)) throw new Error("PROPOSAL_ACTION_NOT_ALLOWED");
      const now = isoNow();
      const next: Record<string, unknown> = { updatedAt: now, updatedBy: auth.user.uid, version: expectedVersion + 1 };
      if (action === "view") next.status = status === "sent" ? "viewed" : status;
      if (action === "decline") next.status = "declined";
      if (action === "request_changes") { next.status = "changes_requested"; next.creatorAcceptedRevisionId = null; next.sponsorAcceptedRevisionId = null; next.creatorResponse = cleanText(body.message).slice(0, 1600); }
      if (action === "accept") {
        const acceptance = proposalAcceptanceState(proposal);
        if (!acceptance.activeRevisionId) throw new Error("PROPOSAL_REVISION_REQUIRED");
        next.creatorAcceptedRevisionId = acceptance.activeRevisionId;
        next.creatorAcceptedAt = now;
        const bothAccepted = proposal.sponsorAcceptedRevisionId === acceptance.activeRevisionId;
        next.status = bothAccepted ? "accepted" : "negotiating";
        next.fundingStatus = bothAccepted ? "eligibility_review_required" : "not_active";
        next.acceptedFoundationOnly = bothAccepted;
      }
      if (action === "counter") {
        const revisionNumber = Number(proposal.revisionNumber ?? 1) + 1;
        const revisionRef = db.collection("sponsorProposalRevisions").doc(`${proposalId}_r${revisionNumber}`);
        const deliverables = body.deliverables === undefined ? proposal.deliverables ?? [] : normalizeProposalDeliverables(body.deliverables);
        const budgetSnapshotCents = body.budget === undefined ? Number(proposal.proposedBudgetCents ?? 0) : cleanMoneyCents(body.budget);
        transaction.create(revisionRef, { id: revisionRef.id, sponsorId: proposal.sponsorId, sponsorOrganizationId: proposal.sponsorOrganizationId ?? proposal.sponsorId, proposalId, status: "countered", revisionNumber, budgetSnapshotCents, deliverablesSnapshot: deliverables, dateSnapshot: { startDate: cleanText(body.startDate ?? proposal.startDate).slice(0, 40), endDate: cleanText(body.endDate ?? proposal.endDate).slice(0, 40) }, creatorMessage: cleanText(body.message).slice(0, 1600), createdAt: now, createdBy: auth.user.uid, immutable: true });
        Object.assign(next, { activeRevisionId: revisionRef.id, revisionNumber, proposedBudgetCents: budgetSnapshotCents, deliverables, status: "negotiating", sponsorAcceptedRevisionId: null, creatorAcceptedRevisionId: null });
      }
      const activityRef = db.collection("sponsorProposalActivity").doc(`${proposalId}_creator_${action}_${expectedVersion + 1}`);
      transaction.update(ref, next);
      transaction.create(activityRef, { sponsorId: proposal.sponsorId, sponsorOrganizationId: proposal.sponsorOrganizationId ?? proposal.sponsorId, proposalId, action: `creator_${action}`, status: next.status ?? status, revisionId: next.activeRevisionId ?? proposal.activeRevisionId ?? null, createdAt: now, createdBy: auth.user.uid });
      updated = { id: proposalId, ...proposal, ...next };
    });
    return ok({ proposal: updated }, action === "accept" ? "Your acceptance was recorded for the current revision. Funding remains subject to both-party acceptance and eligibility checks." : "Proposal response saved.");
  } catch (error) {
    if (error instanceof Error && error.message === "PROPOSAL_VERSION_CONFLICT") return fail("This proposal changed. Refresh it before responding.", 409, undefined, "PROPOSAL_VERSION_CONFLICT");
    if (error instanceof Error && error.message === "PROPOSAL_REVISION_REQUIRED") return validationError({ revision: "A current proposal revision is required." });
    if (error instanceof Error && error.message === "PROPOSAL_ACTION_NOT_ALLOWED") return fail("This response is not available for the proposal's current status.", 422, undefined, "PROPOSAL_ACTION_NOT_ALLOWED");
    console.error("[creator-sponsorship-proposal:patch]", { userId: auth.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal response could not be saved.");
  }
}
