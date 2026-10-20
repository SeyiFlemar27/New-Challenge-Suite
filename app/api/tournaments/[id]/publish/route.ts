import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { canPublishTournament } from "@/lib/server/tournament-permissions";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";
import { evaluateTournamentReadiness } from "@/lib/server/tournaments";
import { freezeTournamentBuilderMedia, normalizeTournamentReviewMedia, verifyTournamentBuilderMedia } from "@/lib/server/tournament-media-verification";
import { mediaVerificationFailure } from "@/lib/server/media-verification-errors";
import { getTournamentCreatorFunding } from "@/lib/server/tournament-creator-funding";
import { readPublicationSafety, recordPublicationHold } from "@/lib/server/publication-guards";
import { tournamentRegistrationReady } from "@/lib/server/tournament-publication";
import { enterpriseChallengeInScope, hasEnterprisePermission, normalizeEnterpriseAccess } from "@/lib/enterprise-access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestUser(request); if (auth.response) return auth.response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Tournament publishing");
  const { id } = await context.params, uid = auth.user.uid;
  const ref = db.collection("tournaments").doc(id), snap = await ref.get();
  if (!snap.exists) return fail("Tournament not found.", 404);
  const record = normalizeTournamentReviewMedia({ ...snap.data(), id });
  const [account, profile] = await Promise.all([db.collection("users").doc(uid).get(), db.collection("profiles").doc(uid).get()]);
  if (!canPublishTournament({ ...profile.data(), ...account.data(), uid }, record).allowed) return fail("You do not have permission to publish this Tournament.", 403, { outcome: "needs_attention" }, "TOURNAMENT_PUBLISH_PERMISSION_REQUIRED");
  if (record.publicationPolicyVersion === 1 && record.publishedAt) return ok({ tournament: record, outcome: record.publicVisibility === false || ["held", "removed", "suspended"].includes(String(record.moderationStatus)) ? "held_for_moderation" : "published", idempotent: true }, "Saved publication state returned.");
  if (record.status !== "draft") return fail("This historical or active Tournament cannot be published through this action. Its saved state is preserved.", 409, { outcome: "needs_attention" }, "TOURNAMENT_REVALIDATION_REQUIRED");
  const validation = validateTournamentFoundation(record, { publish: true, ownerId: String(record.hostId), validateMedia: true });
  const readiness = evaluateTournamentReadiness(record);
  if (!validation.valid || !readiness.ready) return fail("Needs attention. Complete the listed Tournament settings.", 422, { outcome: "needs_attention", fieldErrors: validation.errors, readiness }, "TOURNAMENT_NOT_READY");
  let verification;
  try { verification = await freezeTournamentBuilderMedia(id, await verifyTournamentBuilderMedia(record, String(record.hostId))); }
  catch (error) { const diagnostic = mediaVerificationFailure(error, `TPUB-${crypto.randomUUID().slice(0,8)}`); return fail(diagnostic.message, diagnostic.status, { outcome: "needs_attention", requestId: diagnostic.requestId }, diagnostic.code); }
  const registrationReady = await tournamentRegistrationReady(db), now = new Date().toISOString();
  try {
    const result = await db.runTransaction(async tx => {
      const current = await tx.get(ref), data = current.data();
      const [latestAccount, latestProfile] = await Promise.all([tx.get(account.ref), tx.get(profile.ref)]);
      if (!data || !canPublishTournament({ ...latestProfile.data(), ...latestAccount.data(), uid }, data).allowed) throw new Error("TOURNAMENT_PUBLISH_PERMISSION_REQUIRED");
      if (data.organizationOwnerId || data.officialChallenge === true) {
        const access = normalizeEnterpriseAccess({ ...latestProfile.data(), ...latestAccount.data() });
        if (!access?.organizationId || !hasEnterprisePermission(access, "challenge.create_official") || !enterpriseChallengeInScope(access, data, uid, true)) throw new Error("TOURNAMENT_PUBLISH_PERMISSION_REQUIRED");
        const organization = await tx.get(db.collection("enterpriseOrganizations").doc(access.organizationId));
        if (!organization.exists || organization.data()?.status !== "active") throw new Error("TOURNAMENT_PUBLISH_PERMISSION_REQUIRED");
      }
      if (data.publicationPolicyVersion === 1 && data.publishedAt) return { tournament: { ...data, id }, outcome: data.publicVisibility === false || ["held", "removed", "suspended"].includes(String(data.moderationStatus)) ? "held_for_moderation" : "published", idempotent: true };
      if (data.status !== "draft" || data.updatedAt !== record.updatedAt) throw new Error("TOURNAMENT_DRAFT_STALE");
      const safety = await readPublicationSafety(db, tx, uid, data) || (!data.organizationOwnerId && String(data.hostId) !== uid ? await readPublicationSafety(db, tx, String(data.hostId), data) : null);
      if (safety) return { tournament: { ...data, ...recordPublicationHold(db, tx, id, "tournaments", uid, safety, now), id }, outcome: "held_for_moderation" };
      const funding = await getTournamentCreatorFunding(db, id, data, tx);
      if (data.financialRestriction || data.settlementRestricted === true || data.stripeDisputeRestricted === true) throw new Error("FINANCIAL_RECONCILIATION_REQUIRED");
      if (Number(data.basePrizeAmountMinor ?? 0) === 0 && funding.pendingCount > 0) throw new Error("PENDING_PRIZE_COMMITMENT_CHANGE");
      if (Number(data.basePrizeAmountMinor ?? 0) > funding.confirmedCreatorCents || funding.reviewCount > 0) throw new Error("BASE_PRIZE_FUNDING_REQUIRED");
      const update = { status: registrationReady ? "registration_open" : "scheduled", publicationPolicyVersion: 1, publicationOutcome: "published", publishedAt: now, publicVisibility: true, adminReviewRequired: false, reviewStatus: "not_required", registrationAvailability: registrationReady ? "open" : "temporarily_unavailable", registrationHoldReason: registrationReady ? null : "scheduler_unavailable", publicationHoldReason: null, creatorMediaVerification: verification, coverMedia: { ...data.coverMedia, path: verification.cover.path, url: verification.cover.url }, coverImagePath: verification.cover.path, coverImageUrl: verification.cover.url, updatedAt: now };
      tx.update(ref, update);
      tx.create(db.collection("challengePublicationEvents").doc(`tournament_${id}`), { targetId: id, source: "tournaments", actorId: uid, policyVersion: 1, createdAt: now });
      tx.create(db.collection("tournamentAuditEvents").doc(`published_${id}`), { tournamentId: id, actorId: uid, action: "tournament.published", registrationReady, createdAt: now });
      tx.set(db.collection("notifications").doc(`tournament_published_${id}`), { userId: uid, targetId: id, type: "tournament_published", title: "Tournament published", body: registrationReady ? "Registration is open." : "Your Tournament is public. Registration is temporarily unavailable while scheduling is unavailable.", actionUrl: `/tournaments/${encodeURIComponent(id)}`, read: false, createdAt: now });
      return { tournament: { ...data, ...update, id }, outcome: "published", idempotent: false };
    });
    return ok(result, result.outcome === "published" ? "Tournament published." : "Held for moderation. An existing safety restriction requires investigation.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "PUBLICATION_WRITE_FAILED";
    return fail(code === "BASE_PRIZE_FUNDING_REQUIRED" ? "Confirm the full creator-funded Base Prize before publishing." : "Publication was not confirmed. Refresh the saved draft before retrying.", code === "TOURNAMENT_PUBLISH_PERMISSION_REQUIRED" ? 403 : 409, { outcome: "needs_attention" }, code);
  }
}
