import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const creatorId = String(parsed.body?.creatorId ?? "").trim();
  if (!creatorId) return validationError({ creatorId: "Creator ID is required." });
  try {
    const creatorSnap = await context.db.collection("profiles").doc(creatorId).get();
    const creator = creatorSnap.exists ? creatorSnap.data() ?? {} : {};
    const now = new Date().toISOString();
    const id = `${context.user.uid}_${creatorId}`;
    const payload = { id, sponsorId: context.user.uid, ownerUid: context.user.uid, creatorId, creatorName: creator.displayName ?? creator.username ?? "Creator", niche: creator.creatorNiche ?? creator.niche ?? "Not available yet", location: creator.location ?? "Not available yet", verificationStatus: creator.creatorVerificationStatus ?? creator.verificationStatus ?? "not_available", savedAt: now, updatedAt: now };
    await context.db.collection("sponsorSavedCreators").doc(id).set(payload, { merge: true });
    return ok({ savedCreator: payload }, "Creator saved.");
  } catch (error) {
    console.error("[sponsor-save-creator:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Creator could not be saved.");
  }
}

