import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission, requireAdminUser } from "@/lib/server/auth";
import { hasAdminPermission, type AdminPermission } from "@/lib/server/admin-permissions";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { PATCH as unifiedChallengeReview } from "@/app/api/admin/challenge-reviews/route";

const reviewTypes = new Set(["sponsor", "challenge", "tournament", "sponsorship"]);
const reviewActions = new Set(["approve", "reject", "request_changes"]);

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin reviews");
  const empty = { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] };
  const [sponsors, challenges, sponsorships, prizePools, tournaments] = await Promise.all([
    hasAdminPermission(user?.adminPermissions, "sponsors.review") ? db.collection("sponsorProfiles").where("sponsorVerificationStatus", "==", "pending_review").limit(100).get() : Promise.resolve(empty),
    Promise.resolve(empty),
    hasAdminPermission(user?.adminPermissions, "sponsorCampaigns.review") ? db.collection("sponsorships").where("status", "==", "pending_admin_review").limit(100).get() : Promise.resolve(empty),
    hasAdminPermission(user?.adminPermissions, "finance.view") ? db.collection("prizePools").limit(100).get() : Promise.resolve(empty),
    Promise.resolve(empty)
  ]);
  return ok({
    sponsors: sponsors.docs.map((doc) => ({ id: doc.id, brandName: doc.data().brandName ?? "", status: doc.data().sponsorVerificationStatus })),
    challenges: challenges.docs.map((doc) => ({ id: doc.id, title: doc.data().title ?? "", status: doc.data().status, prizeType: doc.data().prizeType, isLiveEvent: Boolean(doc.data().isLiveEvent), platformFeePercent: doc.data().platformFeePercent ?? 15 })),
    tournaments: tournaments.docs.map(doc => ({ id: doc.id, source: "tournaments", title: doc.data().title ?? "", status: doc.data().status })),
    unifiedQueueUrl: "/api/admin/challenge-reviews",
    legacyQueueTruncated: challenges.docs.length === 100 || tournaments.docs.length === 100,
    sponsorships: sponsorships.docs.map((doc) => ({ id: doc.id, challengeId: doc.data().challengeId, brandName: doc.data().brandName ?? "", status: doc.data().status, sponsorApprovedAt: doc.data().sponsorApprovedAt ?? null, creatorApprovedAt: doc.data().creatorApprovedAt ?? null })),
    prizePools: prizePools.docs.map((doc) => ({
      id: doc.id,
      challengeId: doc.data().challengeId ?? doc.id,
      status: doc.data().status ?? "draft",
      grossEntryRevenueCents: Number(doc.data().grossEntryRevenueCents ?? 0),
      visibleJackpotCents: Number(doc.data().visibleJackpotCents ?? doc.data().amountCents ?? 0),
      platformFeeCents: Number(doc.data().platformFeeCents ?? 0),
      paidEntryCount: Number(doc.data().paidEntryCount ?? 0),
      payoutReviewStatus: doc.data().payoutReviewStatus ?? "not_started",
      winnerSplits: doc.data().winnerSplits ?? [],
      transferEnabled: false
    }))
  }, "Admin review queue loaded.");
}

export async function PATCH(request: Request) {
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const type = String(parsed.body?.type ?? "");
  const id = String(parsed.body?.id ?? "");
  const action = String(parsed.body?.action ?? "");
  if (!reviewTypes.has(type)) return validationError({ type: "Select a valid review type." });
  if (!reviewActions.has(action)) return validationError({ action: "Select approve or reject." });
  if (action === "request_changes" && !["challenge", "tournament"].includes(type)) return validationError({ action: "Select approve or reject for this review type." });
  if (!id) return validationError({ id: "Review record ID is required." });
  if (type === "challenge" || type === "tournament") return unifiedChallengeReview(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify({ ...parsed.body, source: type === "tournament" || parsed.body?.source === "tournaments" ? "tournaments" : "challenges" }) }));
  const permissionByType: Record<string, AdminPermission> = { sponsor: "sponsors.approve", challenge: "challenges.review", sponsorship: "sponsorCampaigns.review" };
  const { user, response } = await requireAdminPermission(request, permissionByType[type]);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin reviews");
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
