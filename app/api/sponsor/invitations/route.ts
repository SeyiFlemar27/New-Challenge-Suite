import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorCreatorInvitations").where("sponsorId", "==", context.user.uid).limit(100).get();
    const invitations = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).updatedAt ?? "").localeCompare(String((a as any).updatedAt ?? "")));
    return ok({ invitations }, "Sponsor creator invitations loaded.");
  } catch (error) {
    console.error("[sponsor-invitations:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor invitations could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const creatorId = cleanText(body.creatorId).slice(0, 120);
  const inviteType = cleanText(body.inviteType, "custom_challenge_request").slice(0, 80);
  const message = cleanText(body.message).slice(0, 1600);
  if (!creatorId) return validationError({ creatorId: "Creator ID is required." });
  if (!["custom_challenge_request", "join_sponsor_campaign"].includes(inviteType)) return validationError({ inviteType: "Choose Custom Challenge Request or Join Sponsor Campaign." });
  if (message.length < 2) return validationError({ message: "Invitation message is required." });
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorCreatorInvitations").doc();
    const invitation = { id: ref.id, sponsorId: context.user.uid, ownerUid: context.user.uid, creatorId, inviteType, linkedCampaignId: cleanText(body.campaignId).slice(0, 120) || null, linkedChallengeId: cleanText(body.challengeId).slice(0, 120) || null, message, status: "pending_creator_response", acceptedFoundationOnly: false, emailSent: false, fakeAcceptance: false, createdAt: now, updatedAt: now, createdBy: context.user.uid, updatedBy: context.user.uid };
    await ref.set(invitation);
    return ok({ invitation }, "Creator invitation saved as pending. No acceptance or email delivery was faked.");
  } catch (error) {
    console.error("[sponsor-invitations:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor invitation could not be saved.");
  }
}
