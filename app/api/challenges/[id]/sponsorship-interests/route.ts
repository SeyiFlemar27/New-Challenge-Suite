import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.db || !access.user) return access.response;
  try {
    const snap = await access.db.collection("sponsorChallengeAgreements").where("challengeId", "==", id).limit(100).get();
    const interests = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() ?? {}) } as Record<string, unknown>)).sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return ok({ interests }, "Sponsorship interests loaded.");
  } catch (error) {
    console.error("[challenge-sponsor-interests:get]", { challengeId: id, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsorship interests could not be loaded.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.db || !access.user) return access.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const agreementId = String(body.agreementId ?? "");
  const action = String(body.action ?? "");
  if (!agreementId || !["accept", "reject"].includes(action)) return validationError({ action: "Agreement ID and accept/reject action are required." });
  const ref = access.db.collection("sponsorChallengeAgreements").doc(agreementId);
  try {
    const result = await access.db.runTransaction(async (transaction) => {
      const [agreementSnap, challengeSnap] = await Promise.all([transaction.get(ref), transaction.get(access.db!.collection("challenges").doc(id))]);
      if (!agreementSnap.exists || !challengeSnap.exists || agreementSnap.data()?.challengeId !== id) throw new Error("INTEREST_NOT_FOUND");
      const agreement = agreementSnap.data() ?? {};
      const challenge = challengeSnap.data() ?? {};
      if (!access.user!.isAdmin && !String(challenge.organizationOwnerId ?? "") && String(challenge.creatorId ?? challenge.hostId ?? "") !== access.user!.uid) throw new Error("OWNER_MISMATCH");
      if (action === "reject") {
        if (["awaiting_sponsor_acceptance", "accepted", "funding_pending", "funded_pending_review", "active"].includes(String(agreement.status))) throw new Error("TERMS_ALREADY_ACCEPTED");
        if (agreement.status === "rejected") return { status: "rejected", duplicate: true };
        const now = new Date().toISOString();
        transaction.set(ref, { status: "rejected", rejectedAt: now, rejectedBy: access.user!.uid, updatedAt: now }, { merge: true });
        return { status: "rejected", duplicate: false };
      }
      if (agreement.status === "awaiting_sponsor_acceptance" && agreement.creatorAcceptedVersion === agreement.termsVersion) return { status: agreement.status, duplicate: true };
      if (agreement.status !== "interest_submitted") throw new Error("INTEREST_NOT_PENDING");
      const now = new Date().toISOString();
      transaction.set(ref, { status: "awaiting_sponsor_acceptance", creatorAcceptedVersion: agreement.termsVersion, creatorAcceptedAt: now, creatorAcceptedBy: access.user!.uid, updatedAt: now }, { merge: true });
      return { status: "awaiting_sponsor_acceptance", duplicate: false };
    });
    return ok(result, result.duplicate ? "Sponsorship decision is already recorded." : action === "accept" ? "Terms accepted by the challenge owner. The Sponsor must accept the same terms before funding." : "Sponsorship interest rejected.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "INTEREST_NOT_FOUND") return fail("Sponsorship interest was not found for this challenge.", 404, undefined, "NOT_FOUND");
    if (code === "OWNER_MISMATCH") return fail("Only the challenge owner can review this interest.", 403, undefined, "PERMISSION_DENIED");
    if (code === "TERMS_ALREADY_ACCEPTED") return fail("Accepted sponsorship terms cannot be rejected or changed after acceptance.", 409, undefined, "TERMS_LOCKED");
    if (code === "INTEREST_NOT_PENDING") return fail("This sponsorship interest is no longer awaiting creator review.", 409, undefined, "INVALID_TRANSITION");
    return serverError("Sponsorship decision could not be saved.");
  }
}
