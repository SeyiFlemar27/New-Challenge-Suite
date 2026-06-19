import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRole } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { fail, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsorship proposals");
  const permission = requireRole(user, ["sponsor"]);
  if (permission) return permission;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const fieldErrors: Record<string, string> = {};
  if (!body?.sponsorName) fieldErrors.sponsorName = "Sponsor name is required.";
  if (!body?.contactEmail) fieldErrors.contactEmail = "Contact email is required.";
  if (!Number.isFinite(Number(body?.amount)) || Number(body?.amount) <= 0) fieldErrors.amount = "Amount must be greater than zero.";
  if (Object.keys(fieldErrors).length) return validationError(fieldErrors);
  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, { fieldErrors: { challengeId: "Challenge does not exist." } }, "NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const eligibleStatuses = ["published", "registration_open", "active", "voting"];
  if (!eligibleStatuses.includes(String(challenge.status ?? ""))) return fail("This challenge is not eligible for sponsorship.", 409, undefined, "SPONSORSHIP_REJECTED");
  const ref = db.collection("sponsorships").doc();
  const now = new Date().toISOString();
  const proposal = { id: ref.id, challengeId: id, userId: user.uid, sponsorName: body.sponsorName, brandName: body.brandName ?? "", contactEmail: body.contactEmail, amount: Number(body.amount), prizePoolContribution: Number(body.prizePoolContribution ?? 0), message: body.message ?? "", brandingPreference: body.brandingPreference ?? "Logo on challenge page", status: "pending_review", createdAt: now, updatedAt: now };
  await ref.set(proposal);
  await createNotification(db, { userId: user.uid, type: "sponsorship_submitted", title: "Sponsorship submitted", body: "Your proposal is pending admin review.", targetId: ref.id });
  return ok({ sponsorship: proposal }, "Sponsorship proposal submitted for admin review.");
}
