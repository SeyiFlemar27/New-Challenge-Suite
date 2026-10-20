import { challengeReviewBuilderDestination } from "@/lib/notification-navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { createHash } from "node:crypto";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canCreateTournament } from "@/lib/server/tournament-permissions";
import { isFirestoreMissingIndexError } from "@/lib/server/tournament-public";
import { isPublishedTournament, publicTournamentView, withTournamentRegistrationAvailability } from "@/lib/server/tournament-public-policy";
import { tournamentRegistrationReady } from "@/lib/server/tournament-publication";
import { evaluateTournamentReadiness, tournamentDraftFromInput, tournamentSubdomainFoundation } from "@/lib/server/tournaments";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";
import { hasEnterprisePermission, normalizeEnterpriseAccess } from "@/lib/enterprise-access";
import { freezeTournamentBuilderMedia, verifyTournamentBuilderMedia } from "@/lib/server/tournament-media-verification";
import { mediaVerificationFailure } from "@/lib/server/media-verification-errors";
import { TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament listing");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  try {
    const snap = await db.collection("tournaments").where("privacy", "==", "public").limit(100).get();
    const schedulingReady = await tournamentRegistrationReady(db);
    const tournaments = (snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown> & { id: string })
      .filter((item) => item.privacy === "public")
      .filter(isPublishedTournament)
      .filter((item) => !status || item.status === status)
      .filter((item) => !category || item.category === category)
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
      .slice(0, 50)
      .map((item) => publicTournamentView(withTournamentRegistrationAvailability(item, schedulingReady))));
    return ok({ tournaments, foundation: tournamentSubdomainFoundation(), emptyState: tournaments.length ? null : "No tournaments found from backend state." }, "Tournament records loaded.");
  } catch (error) {
    if (isFirestoreMissingIndexError(error)) {
      console.warn("[tournament-firestore-index]", { scope: "api:tournaments:list", message: "Firestore index required for this query." });
      return fail("Tournament discovery is temporarily unavailable. Please retry; the listing could not be loaded.", 503, undefined, "TOURNAMENT_INDEX_REQUIRED");
    }
    throw error;
  }
}

export async function POST(request: Request): Promise<Response> {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament creation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  if (["pending_review", "publish"].includes(String((parsed.body as Record<string, unknown> | undefined)?.status))) {
    const saved = await POST(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...parsed.body, status: "draft" }) }));
    if (!saved.ok) return saved;
    const result = await saved.json();
    const { POST: publish } = await import("@/app/api/tournaments/[id]/publish/route");
    return publish(request, { params: Promise.resolve({ id: result.data.tournament.id }) });
  }
  const creationKey = request.headers.get("x-challenge-creation-key") ?? "";
  if (creationKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(creationKey)) return fail("Invalid draft retry reference.", 422);
  const ref = creationKey ? db.collection("tournaments").doc(createHash("sha256").update(`tournament:${user.uid}:${creationKey}`).digest("hex").slice(0, 32)) : db.collection("tournaments").doc();
  if (creationKey) {
    const existing = await ref.get();
    if (existing.exists) return ok({ tournament: { ...existing.data(), id: ref.id }, idempotent: true }, "Your saved Tournament was recovered. No duplicate was created.");
  }
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  body.productPolicyVersion = TOURNAMENT_PRODUCT_POLICY;
  const requestedStatus = body.status === "pending_review" ? "pending_review" : "draft";
  if (requestedStatus === "pending_review" && Number(body.basePrizeAmountMinor ?? 0) > 0) return fail("Save this Tournament as a draft and confirm its creator-funded Base Prize before Admin Review.", 409, undefined, "BASE_PRIZE_FUNDING_REQUIRED");
  if (body.status && body.status !== "draft" && body.status !== "pending_review") return fail("Tournament status is not valid for this action.", 422, undefined, "TOURNAMENT_STATUS_INVALID");
  const [userSnap, profileSnap] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("profiles").doc(user.uid).get()]);
  const profile = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}), uid: user.uid, role: user.role, isAdmin: user.isAdmin };
  const enterpriseAccess = normalizeEnterpriseAccess(profile);
  const officialChallenge = body.officialChallenge === true;
  if (officialChallenge && (!hasEnterprisePermission(enterpriseAccess, "challenge.create_official") || body.ownershipType !== "challenge_suite_official")) return fail("Your Enterprise role cannot create official tournaments.", 403, undefined, "ENTERPRISE_OFFICIAL_CREATE_DENIED");
  if (body.ownershipType === "enterprise_personal") return fail("Enterprise tournaments must use the organization-owned challenge flow.", 409, undefined, "ENTERPRISE_PERSONAL_OWNERSHIP_RETIRED");
  if (officialChallenge && !enterpriseAccess?.organizationId) return fail("Your Enterprise organization context is still being provisioned. Try again shortly or contact support.", 409, undefined, "ENTERPRISE_ORGANIZATION_REQUIRED");
  const permission = canCreateTournament(profile);
  if (!permission.allowed) return fail("Tournament hosting requires Host, approved Enterprise, or allowed premium Creator access.", 403, permission, "TOURNAMENT_HOSTING_LOCKED");
  const validation = validateTournamentFoundation(body, { publish: requestedStatus === "pending_review", ownerId: user.uid });
  if (!validation.valid) return validationError(Object.fromEntries(validation.errors.map((issue) => [issue.field, issue.message])));
  let creatorMediaVerification = null;
  if (requestedStatus === "pending_review") {
    try { creatorMediaVerification = await freezeTournamentBuilderMedia(ref.id, await verifyTournamentBuilderMedia(body, user.uid)); }
    catch (error) { const diagnostic = mediaVerificationFailure(error, `TPUB-${crypto.randomUUID().slice(0,8)}`); console.warn("[tournament-media-verification]", {category:diagnostic.category,stage:diagnostic.stage,requestId:diagnostic.requestId}); return fail(diagnostic.message, diagnostic.status, {requestId:diagnostic.requestId}, diagnostic.code); }
  }
  const now = new Date().toISOString();
  const draft = tournamentDraftFromInput({ ...body, enterpriseOrganizationId: officialChallenge ? enterpriseAccess!.organizationId : null }, user.uid, now);
  const readiness = evaluateTournamentReadiness({ id: ref.id, ...draft });
  if (requestedStatus === "pending_review" && !readiness.ready) return fail("Tournament details need attention before review.", 422, { fieldErrors: readiness.errors }, "TOURNAMENT_NOT_READY");
  const tournament = { id: ref.id, ...draft, status: requestedStatus, submittedAt: requestedStatus === "pending_review" ? now : null, readiness, bracketExecutionEnabled: true, paymentActivationEnabled: false, payoutExecutionEnabled: false, fakeParticipantsAllowed: false, fakeBracketAllowed: false, fakeWinnersAllowed: false };
  if (creatorMediaVerification) Object.assign(tournament, { creatorMediaVerification, coverMedia: { ...draft.coverMedia, path: creatorMediaVerification.cover.path, url: creatorMediaVerification.cover.url } });
  const batch = db.batch();
  batch.create(ref, tournament);
  if (requestedStatus === "pending_review") {
    batch.set(db.collection("tournamentReviewRequests").doc(`${ref.id}_initial`), { id: `${ref.id}_initial`, tournamentId: ref.id, hostId: user.uid, status: "pending_review", revision: 1, createdAt: now, updatedAt: now });
    batch.set(db.collection("tournamentAuditEvents").doc(`${ref.id}_submitted_initial`), { id: `${ref.id}_submitted_initial`, tournamentId: ref.id, actorId: user.uid, action: "submitted_for_review", createdAt: now, metadata: { status: "pending_review" } });
    batch.set(db.collection("notifications").doc(`${ref.id}_submitted_initial`), { userId: user.uid, type: "tournament_submitted", title: "Tournament submitted for review", body: "Your challenge has been submitted for review.", targetId: ref.id, actionUrl: challengeReviewBuilderDestination(tournament, ref.id, "tournaments"), read: false, delivery: { inApp: true, email: false }, createdAt: now });
    batch.set(db.collection("tournamentEmailOutbox").doc(`${ref.id}_submitted_initial`), { tournamentId: ref.id, userId: user.uid, category: "challengeReminders", title: "Tournament submitted for review", message: "Your challenge has been submitted for review.", status: "pending", createdAt: now });
  }
  try { await batch.commit(); }
  catch (error) {
    if (creationKey && [6, "already-exists"].includes((error as {code?: number|string})?.code ?? "")) {
      const existing = await ref.get();
      if (existing.exists) return ok({ tournament: { ...existing.data(), id: ref.id }, idempotent: true }, "Your saved Tournament was recovered. No duplicate was created.");
    }
    throw error;
  }
  const { attemptTournamentNotifications } = await import("@/lib/server/tournament-notifications");
  await attemptTournamentNotifications(db, ref.id);
  return ok({ tournament }, requestedStatus === "pending_review" ? "Your challenge has been submitted for review." : "Tournament draft created. No bracket, participants, payments, prize pool, winners, or payouts were created.");
}
