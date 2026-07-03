import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsorship approval");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const action = parsed.body?.action;
  if (!["approve", "reject", "cancel"].includes(action)) return validationError({ action: "Select approve, reject, or cancel." });

  const ref = db.collection("sponsorships").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail("Sponsorship proposal not found.", 404, undefined, "NOT_FOUND");
  const proposal = snap.data() ?? {};
  const isSponsor = proposal.sponsorId === user.uid || proposal.userId === user.uid;
  const isCreator = proposal.creatorId === user.uid;
  if (!isSponsor && !isCreator) return fail("You cannot review this sponsorship proposal.", 403, undefined, "PERMISSION_DENIED");

  const now = new Date().toISOString();
  if (action === "reject" || action === "cancel") {
    const status = action === "cancel" ? "cancelled" : "rejected";
    await ref.set({ status, agreementStatus: status, updatedAt: now }, { merge: true });
    return ok({ id, status }, action === "cancel" ? "Sponsorship proposal cancelled." : "Sponsorship proposal rejected.");
  }

  const sponsorApprovedAt = isSponsor ? now : proposal.sponsorApprovedAt ?? null;
  const creatorApprovedAt = isCreator ? now : proposal.creatorApprovedAt ?? null;
  const bothApproved = Boolean(sponsorApprovedAt && creatorApprovedAt);
  const status = bothApproved ? "pending_admin_review" : isCreator ? "pending_sponsor" : "pending_creator";
  await ref.set({
    sponsorApprovedAt,
    creatorApprovedAt,
    status,
    agreementStatus: status,
    adminApprovedAt: null,
    moneyMovementEnabled: false,
    sponsorMoneyCaptureStatus: "not_active",
    fundingReleaseStatus: "not_active",
    updatedAt: now
  }, { merge: true });
  return ok({ id, status }, bothApproved ? "Both parties agreed. The arrangement is pending platform review; no money was captured." : "Your approval was recorded.");
}
