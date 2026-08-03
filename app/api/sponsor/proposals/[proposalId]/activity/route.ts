import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";
import { fail } from "@/lib/server/responses";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { createNotification } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.user.uid);
    if (owned.response) return owned.response;
    const snap = await context.db.collection("sponsorProposalActivity").where("proposalId", "==", proposalId).where("sponsorId", "==", context.user.uid).limit(100).get();
    const activity = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).createdAt ?? "").localeCompare(String((a as any).createdAt ?? "")));
    return ok({ activity }, "Proposal activity loaded.");
  } catch (error) {
    console.error("[sponsor-proposal-activity:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal activity could not be loaded.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const rateLimit = consumeRateLimit(`sponsor-proposal-reminder:${context.user.uid}`, { limit: 5, windowMs: 60_000 });
  if (!rateLimit.allowed) return fail("Please wait before sending another reminder.", 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, "RATE_LIMITED");
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.user.uid);
    if (owned.response) return owned.response;
    const proposal = owned.snap.data() ?? {};
    const status = String(proposal.status ?? "draft");
    if (!["sent", "viewed", "received", "under_review", "negotiating", "changes_requested"].includes(status)) return fail("Reminders are available only while a sent proposal is awaiting a decision.", 409, undefined, "PROPOSAL_REMINDER_UNAVAILABLE");
    const creatorId = String(proposal.linkedCreatorId ?? "");
    if (!creatorId) return fail("This proposal does not have an eligible recipient for reminders.", 409, undefined, "PROPOSAL_RECIPIENT_REQUIRED");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const prior = await context.db.collection("sponsorProposalActivity").where("proposalId", "==", proposalId).where("sponsorId", "==", context.user.uid).limit(50).get();
    if (prior.docs.some((doc) => doc.data().action === "proposal_reminder_sent" && String(doc.data().createdAt ?? "") >= since)) return fail("A reminder was already sent for this proposal in the last 24 hours.", 409, undefined, "PROPOSAL_REMINDER_COOLDOWN");
    const now = new Date().toISOString();
    await Promise.all([
      context.db.collection("sponsorProposalActivity").add({ sponsorId: context.user.uid, proposalId, action: "proposal_reminder_sent", status, createdAt: now, createdBy: context.user.uid }),
      createNotification(context.db, { userId: creatorId, type: "sponsor_proposal_reminder", title: "Sponsor proposal reminder", message: String(proposal.title ?? "A sponsor proposal") + " is awaiting your review.", entityType: "sponsor_proposal", entityId: proposalId, actionUrl: `/sponsor/proposals/${proposalId}`, idempotencyKey: `proposal_reminder_${proposalId}_${now.slice(0, 10)}` })
    ]);
    return ok({ proposalId, remindedAt: now }, "Proposal reminder sent.");
  } catch (error) {
    console.error("[sponsor-proposal-reminder:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal reminder could not be sent.");
  }
}
