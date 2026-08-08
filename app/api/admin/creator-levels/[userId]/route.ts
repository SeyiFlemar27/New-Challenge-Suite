import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { ECONOMY_V1_RULES } from "@/lib/server/economy-rules";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { user, response } = await requireRecentAdminAuthentication(request, "settings.editFinancial");
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const { userId } = await params;
  const levelId = String(parsed.body?.levelId ?? "");
  const reason = String(parsed.body?.reason ?? "").trim();
  const level = ECONOMY_V1_RULES.creatorLevels.find((item) => item.id === levelId);
  if (!level || reason.length < 8) return validationError({ promotion: "A valid creator level and meaningful reason are required." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator level promotion");
  const profile = await db.collection("profiles").doc(userId).get();
  if (!profile.exists) return fail("Creator profile not found.", 404);
  if (levelId === "verified" && !["verified", "approved"].includes(String(profile.data()?.kycStatus ?? profile.data()?.verificationStatus ?? ""))) return fail("Verified Creator requires completed profile or KYC verification.", 409, undefined, "VERIFICATION_REQUIRED");
  const now = new Date().toISOString();
  await profile.ref.set({ manualCreatorLevelId: levelId, manualCreatorLevelName: level.name, creatorLevelPromotedBy: user.uid, creatorLevelPromotionReason: reason, creatorLevelPromotedAt: now, updatedAt: now }, { merge: true });
  await writeAuditLog({ actorId: user.uid, actorType: "admin", action: "creator.level_promoted", targetType: "account", targetId: userId, reason, after: { levelId, levelName: level.name } }, db);
  return ok({ level }, "Creator level promotion recorded.");
}
