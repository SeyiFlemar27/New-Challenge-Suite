import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";

const reviewTypes = new Set(["sponsor", "challenge", "sponsorship"]);
const reviewActions = new Set(["approve", "reject"]);

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin reviews");
  const [sponsors, challenges, sponsorships] = await Promise.all([
    db.collection("sponsorProfiles").where("sponsorVerificationStatus", "==", "pending_review").limit(100).get(),
    db.collection("challenges").where("adminReviewRequired", "==", true).limit(100).get(),
    db.collection("sponsorships").where("status", "==", "pending_admin_review").limit(100).get()
  ]);
  return ok({
    sponsors: sponsors.docs.map((doc) => ({ id: doc.id, brandName: doc.data().brandName ?? "", status: doc.data().sponsorVerificationStatus })),
    challenges: challenges.docs.map((doc) => ({ id: doc.id, title: doc.data().title ?? "", status: doc.data().status, prizeType: doc.data().prizeType, isLiveEvent: Boolean(doc.data().isLiveEvent), platformFeePercent: doc.data().platformFeePercent ?? 15 })),
    sponsorships: sponsorships.docs.map((doc) => ({ id: doc.id, challengeId: doc.data().challengeId, brandName: doc.data().brandName ?? "", status: doc.data().status, sponsorApprovedAt: doc.data().sponsorApprovedAt ?? null, creatorApprovedAt: doc.data().creatorApprovedAt ?? null }))
  }, "Admin review queue loaded.");
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin reviews");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const type = String(parsed.body?.type ?? "");
  const id = String(parsed.body?.id ?? "");
  const action = String(parsed.body?.action ?? "");
  if (!reviewTypes.has(type)) return validationError({ type: "Select a valid review type." });
  if (!reviewActions.has(action)) return validationError({ action: "Select approve or reject." });
  if (!id) return validationError({ id: "Review record ID is required." });
  const now = new Date().toISOString();

  if (type === "sponsor") {
    const ref = db.collection("sponsorProfiles").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return fail("Sponsor profile not found.", 404, undefined, "NOT_FOUND");
    const status = action === "approve" ? "approved" : "rejected";
    await Promise.all([
      ref.set({ sponsorVerificationStatus: status, sponsorVerifiedAt: action === "approve" ? now : null, updatedAt: now }, { merge: true }),
      db.collection("users").doc(id).set({ sponsorVerificationStatus: status, updatedAt: now }, { merge: true }),
      db.collection("profiles").doc(id).set({ sponsorVerificationStatus: status, updatedAt: now }, { merge: true })
    ]);
  }

  if (type === "challenge") {
    const ref = db.collection("challenges").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
    const challenge = snap.data() ?? {};
    const approved = action === "approve";
    await ref.set({
      adminReviewRequired: false,
      adminApprovalStatus: approved ? "approved" : "rejected",
      prizeApprovalStatus: approved ? "approved" : "rejected",
      eventApprovalStatus: challenge.isLiveEvent ? approved ? "approved" : "rejected" : challenge.eventApprovalStatus ?? "not_required",
      eventSyncStatus: challenge.isLiveEvent ? approved ? "synced" : "rejected" : challenge.eventSyncStatus ?? "not_applicable",
      eventVisibility: challenge.isLiveEvent ? approved ? "public" : "hidden" : challenge.eventVisibility ?? "not_applicable",
      status: approved ? "scheduled" : "draft",
      updatedAt: now
    }, { merge: true });
    if (approved && challenge.isLiveEvent) {
      await db.collection("liveEvents").doc(id).set({
        id,
        challengeId: id,
        title: challenge.title ?? "",
        description: challenge.description ?? "",
        hostName: challenge.creatorName ?? "Challenge Host",
        creatorId: challenge.creatorId ?? null,
        imageUrl: challenge.coverImageUrl ?? challenge.promoImageUrl ?? null,
        location: [challenge.venueName, challenge.eventCity, challenge.eventCountry].filter(Boolean).join(", "),
        startsAt: challenge.startsAt,
        time: challenge.startsAt,
        capacity: challenge.eventCapacity ?? challenge.maxParticipants ?? 0,
        status: "scheduled",
        visibility: "public",
        source: "challenge_sync",
        moneyMovementEnabled: false,
        updatedAt: now,
        createdAt: challenge.createdAt ?? now
      }, { merge: true });
    }
  }

  if (type === "sponsorship") {
    const ref = db.collection("sponsorships").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return fail("Sponsorship proposal not found.", 404, undefined, "NOT_FOUND");
    const proposal = snap.data() ?? {};
    if (action === "approve" && (!proposal.sponsorApprovedAt || !proposal.creatorApprovedAt)) {
      return fail("Both sponsor and creator approval are required before platform approval.", 409, undefined, "PARTY_APPROVAL_REQUIRED");
    }
    await ref.set({
      status: action === "approve" ? "approved" : "rejected",
      agreementStatus: action === "approve" ? "approved" : "rejected",
      adminApprovedAt: action === "approve" ? now : null,
      moneyMovementEnabled: false,
      sponsorMoneyCaptureStatus: "not_active",
      fundingReleaseStatus: "not_active",
      updatedAt: now
    }, { merge: true });
  }

  await writeAuditLog({
    actorId: user.uid,
    actorType: "admin",
    action: `${type}.${action}`,
    targetType: type,
    targetId: id,
    reason: "Phase 5.6 admin review decision.",
    metadata: { moneyMovementEnabled: false }
  }, db);
  return ok({ type, id, action }, "Review decision saved. No money movement was performed.");
}
