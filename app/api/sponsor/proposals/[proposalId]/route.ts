import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { createNotification } from "@/lib/server/notifications";
import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { cleanText, isoNow, proposalAcceptanceState, proposalIsExpired } from "@/lib/sponsor-collaboration";
import { proposalPayload } from "../route";

export const dynamic = "force-dynamic";

const actionableStatuses = new Set(["sent", "viewed", "received", "under_review", "negotiating", "changes_requested"]);

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.sponsorId);
    if (owned.response) return owned.response;
    const [revisionsSnap, activitySnap, notesSnap] = await Promise.all([
      context.db.collection("sponsorProposalRevisions").where("proposalId", "==", proposalId).where("sponsorId", "==", context.sponsorId).limit(50).get(),
      context.db.collection("sponsorProposalActivity").where("proposalId", "==", proposalId).where("sponsorId", "==", context.sponsorId).limit(50).get(),
      context.db.collection("sponsorInternalNotes").where("relatedEntityId", "==", proposalId).where("sponsorId", "==", context.sponsorId).limit(25).get()
    ]);
    const byDate = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    return ok({ proposal: { id: owned.snap.id, ...owned.snap.data() }, revisions: revisionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort(byDate), activity: activitySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort(byDate), internalNotes: notesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort(byDate) }, "Proposal loaded.");
  } catch (error) {
    console.error("[sponsor-proposal:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal could not be loaded.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const requested = cleanText(body.action ?? body.status).toLowerCase();
  const action = requested === "sent" ? "send" : requested === "accepted" ? "accept" : requested === "withdrawn" ? "withdraw" : requested === "archived" ? "archive" : requested;
  if (!["save_draft", "send", "accept", "withdraw", "archive"].includes(action)) return validationError({ action: "Choose an available proposal action." });
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.sponsorId);
    if (owned.response) return owned.response;
    const expectedVersion = Number(body.expectedVersion ?? owned.snap.data()?.version ?? 0);
    let updated: Record<string, unknown> | null = null;
    await context.db.runTransaction(async (transaction) => {
      const ref = context.db.collection("sponsorProposals").doc(proposalId);
      const fresh = await transaction.get(ref);
      const proposal = fresh.data() ?? {};
      if (Number(proposal.version ?? 0) !== expectedVersion) throw new Error("PROPOSAL_VERSION_CONFLICT");
      const status = String(proposal.status ?? "draft");
      const now = isoNow();
      const next: Record<string, unknown> = { updatedAt: now, updatedBy: context.user.uid, version: expectedVersion + 1 };
      if (["send", "accept"].includes(action) && proposalIsExpired(proposal)) throw new Error("PROPOSAL_EXPIRED");
      if (action === "save_draft") {
        if (status !== "draft") throw new Error("PROPOSAL_ACTION_NOT_ALLOWED");
        Object.assign(next, proposalPayload({ ...body, status: "draft" }, context.sponsorId, now, proposal), { ownerUid: proposal.ownerUid ?? context.user.uid, sponsorOrganizationId: context.organizationId });
        const revisionNumber = Number(proposal.revisionNumber ?? 1) + 1;
        const revisionRef = context.db.collection("sponsorProposalRevisions").doc(`${proposalId}_r${revisionNumber}`);
        next.activeRevisionId = revisionRef.id;
        next.revisionNumber = revisionNumber;
        next.sponsorAcceptedRevisionId = null;
        next.creatorAcceptedRevisionId = null;
        transaction.create(revisionRef, { id: revisionRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, proposalId, status: "proposed", revisionNumber, budgetSnapshotCents: next.proposedBudgetCents, deliverablesSnapshot: next.deliverables, dateSnapshot: { startDate: next.startDate, endDate: next.endDate, expiresAt: next.expiresAt ?? null }, paymentPreference: next.paymentPreference, usageRights: next.usageRights, cancellationTerms: next.cancellationTerms, sponsorRole: next.sponsorRole, sponsorCategory: next.sponsorCategory, categoryExclusive: next.categoryExclusive, requestedPlacements: next.requestedPlacements, sponsorMessage: next.notesToCreator, createdAt: now, createdBy: context.user.uid, immutable: true });
      } else if (action === "send") {
        if (status !== "draft") throw new Error("PROPOSAL_ACTION_NOT_ALLOWED");
        if (!proposal.linkedCreatorId && !proposal.linkedChallengeId) throw new Error("PROPOSAL_RECIPIENT_REQUIRED");
        next.status = "sent";
      } else if (action === "withdraw") {
        if (!actionableStatuses.has(status)) throw new Error("PROPOSAL_ACTION_NOT_ALLOWED");
        next.status = "withdrawn";
      } else if (action === "archive") {
        if (!["declined", "withdrawn", "expired", "cancelled", "completed"].includes(status)) throw new Error("PROPOSAL_ACTION_NOT_ALLOWED");
        next.status = "archived";
      } else {
        if (!actionableStatuses.has(status)) throw new Error("PROPOSAL_ACTION_NOT_ALLOWED");
        const acceptance = proposalAcceptanceState(proposal);
        if (!acceptance.activeRevisionId) throw new Error("PROPOSAL_REVISION_REQUIRED");
        next.sponsorAcceptedRevisionId = acceptance.activeRevisionId;
        next.sponsorAcceptedAt = next.updatedAt;
        const bothAccepted = proposal.creatorAcceptedRevisionId === acceptance.activeRevisionId;
        next.status = bothAccepted ? "accepted" : "negotiating";
        next.fundingStatus = bothAccepted ? "eligibility_review_required" : "not_active";
        next.acceptedFoundationOnly = bothAccepted;
      }
      const activityRef = context.db.collection("sponsorProposalActivity").doc(`${proposalId}_${action}_${expectedVersion + 1}`);
      transaction.update(ref, next);
      transaction.create(activityRef, { sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, proposalId, action: `proposal_${action}`, status: next.status ?? status, revisionId: proposal.activeRevisionId ?? null, createdAt: next.updatedAt, createdBy: context.user.uid });
      updated = { id: proposalId, ...proposal, ...next };
    });
    const saved = updated as Record<string, unknown> | null;
    if (action === "send" && saved) {
      let creatorId = String(saved.linkedCreatorId ?? "");
      const challengeId = String(saved.linkedChallengeId ?? "");
      if (!creatorId && challengeId) {
        const challenge = (await context.db.collection("challenges").doc(challengeId).get()).data() ?? {};
        creatorId = String(challenge.creatorId ?? challenge.ownerId ?? challenge.hostId ?? challenge.createdBy ?? "");
      }
      if (creatorId) await createNotification(context.db, { userId: creatorId, type: "sponsorship_received", title: "New sponsorship proposal", body: `${String(saved.title ?? "A sponsor")} sent sponsorship terms for your review.`, entityType: "sponsor_proposal", entityId: proposalId, actionUrl: `/creator/sponsorships?proposal=${encodeURIComponent(proposalId)}`, idempotencyKey: `sponsor_proposal_sent_${proposalId}_${String(saved.version)}` }).catch(() => undefined);
    }
    return ok({ proposal: updated }, action === "save_draft" ? "Proposal draft saved." : action === "accept" ? "Your acceptance was recorded for the current revision. Funding remains unavailable until both parties accept the same revision and eligibility checks pass." : "Proposal updated.");
  } catch (error) {
    if (error instanceof Error && error.message === "PROPOSAL_VERSION_CONFLICT") return fail("This proposal changed. Refresh it before taking action.", 409, undefined, "PROPOSAL_VERSION_CONFLICT");
    if (error instanceof Error && error.message === "PROPOSAL_RECIPIENT_REQUIRED") return validationError({ recipient: "Select an eligible creator or challenge before sending." });
    if (error instanceof Error && error.message === "PROPOSAL_REVISION_REQUIRED") return validationError({ revision: "A current proposal revision is required." });
    if (error instanceof Error && error.message === "PROPOSAL_EXPIRED") return fail("This proposal has expired. Update its expiration date before continuing.", 422, undefined, "PROPOSAL_EXPIRED");
    if (error instanceof Error && error.message === "PROPOSAL_ACTION_NOT_ALLOWED") return fail("This action is not available for the proposal's current status.", 422, undefined, "PROPOSAL_ACTION_NOT_ALLOWED");
    console.error("[sponsor-proposal:patch]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal could not be updated.");
  }
}
