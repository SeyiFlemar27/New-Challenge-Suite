import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  verificationStatus: z.enum(["under_review", "additional_information_required", "verified", "rejected", "flagged"]),
  sponsorVerificationStatus: z.enum(["pending_review", "approved", "rejected", "needs_changes", "suspended"]).optional(),
  safeReason: z.string().trim().max(500).optional().or(z.literal("")),
  internalNote: z.string().trim().max(1000).optional().or(z.literal(""))
});

export async function PATCH(request: Request, { params }: { params: Promise<{ sponsorId: string }> }) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor verification");
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError({ verificationStatus: "A supported verification status is required." });
  try {
    const { sponsorId } = await params;
    const now = new Date().toISOString();
    const input = parsed.data;
    const sponsorVerificationStatus = input.sponsorVerificationStatus ?? (input.verificationStatus === "verified" ? "approved" : input.verificationStatus === "additional_information_required" ? "needs_changes" : input.verificationStatus === "flagged" ? "suspended" : input.verificationStatus === "rejected" ? "rejected" : "pending_review");
    const update = {
      businessVerificationStatus: input.verificationStatus,
      sponsorVerificationStatus,
      sponsorReviewFeedback: input.safeReason || null,
      businessVerifiedAt: input.verificationStatus === "verified" ? now : null,
      businessRejectedAt: input.verificationStatus === "rejected" ? now : null,
      verificationUpdatedAt: now,
      verificationUpdatedBy: user.uid,
      updatedAt: now
    };
    await Promise.all([
      db.collection("sponsorProfiles").doc(sponsorId).set(update, { merge: true }),
      db.collection("users").doc(sponsorId).set(update, { merge: true }),
      db.collection("profiles").doc(sponsorId).set(update, { merge: true }),
      db.collection("sponsorVerification").doc(sponsorId).set({ userId: sponsorId, ...update, safeReason: input.safeReason || null, rawDocumentsStored: false }, { merge: true }),
      db.collection("sponsorAuditLogs").add({ sponsorId, adminId: user.uid, action: "sponsor_verification_updated", businessVerificationStatus: input.verificationStatus, sponsorVerificationStatus, safeReason: input.safeReason || null, internalNote: input.internalNote || null, createdAt: now })
    ]);
    return ok({ sponsorId, businessVerificationStatus: input.verificationStatus, sponsorVerificationStatus }, "Sponsor verification foundation updated.");
  } catch (error) {
    console.error("[admin-sponsor-verification:patch]", { adminId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor verification could not be updated.");
  }
}