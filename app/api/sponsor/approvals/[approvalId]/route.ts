import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError } from "@/lib/server/responses";
import { cleanText, isoNow, normalizeApprovalStatus } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { approvalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorApprovals", approvalId, context.user.uid);
    if (owned.response) return owned.response;
    const [activitySnap, commentsSnap] = await Promise.all([context.db.collection("sponsorApprovalActivity").where("approvalId", "==", approvalId).where("sponsorId", "==", context.user.uid).limit(50).get(), context.db.collection("sponsorApprovalComments").where("approvalId", "==", approvalId).where("sponsorId", "==", context.user.uid).limit(50).get()]);
    return ok({ approval: { id: owned.snap.id, ...owned.snap.data() }, activity: activitySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), comments: commentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }, "Approval item loaded.");
  } catch (error) {
    console.error("[sponsor-approval:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Approval item could not be loaded.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const { approvalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorApprovals", approvalId, context.user.uid);
    if (owned.response) return owned.response;
    const now = isoNow();
    const existing = owned.snap.data() ?? {};
    const status = normalizeApprovalStatus(body.status ?? existing.status);
    const patch = { status, feedback: cleanText(body.feedback ?? existing.feedback).slice(0, 1600), updatedAt: now, updatedBy: context.user.uid, paymentReleaseStatus: "not_active", publishStatus: "not_automatic", contractStatus: "not_active", version: Number(existing.version ?? 0) + 1 };
    await Promise.all([context.db.collection("sponsorApprovals").doc(approvalId).set(patch, { merge: true }), context.db.collection("sponsorApprovalActivity").add({ sponsorId: context.user.uid, approvalId, action: `approval_${status}`, status, feedback: patch.feedback, createdAt: now, createdBy: context.user.uid })]);
    return ok({ approval: { id: approvalId, ...existing, ...patch } }, "Approval updated. No money release, contract signature, or automatic publish was triggered.");
  } catch (error) {
    console.error("[sponsor-approval:patch]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Approval item could not be updated.");
  }
}
