import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { ChallengeAdminReviewError, decideChallengeReview, listChallengeReviews, reviewKind, reviewState } from "@/lib/server/challenge-admin-review";
import { POST as reviewTournament } from "@/app/api/admin/tournaments/[id]/route";

export const dynamic = "force-dynamic";
const fields = ["title", "description", "category", "subcategory", "creatorId", "hostId", "creatorName", "hostName", "visibility", "type", "isLiveEvent", "status", "reviewStatus", "adminApprovalStatus", "reviewReason", "reviewedAt", "reviewedBy", "submittedAt", "submittedForReviewAt", "createdAt", "updatedAt", "challengeRules", "standardRules", "tournamentRules", "submissionInstructionsList", "submissionInstructions", "acceptedSubmissionTypes", "submissionMediaTypes", "coverImageUrl", "coverImagePath", "challengeImages", "challengeVideo", "trailerVideoUrl", "promoImageUrl", "promoVideoUrl", "coverMedia", "galleryMedia", "trailerMedia", "startsAt", "endsAt", "submissionDeadline", "votingStartsAt", "votingDeadline", "registrationOpensAt", "registrationClosesAt", "timeZone", "hostOperations", "venueName", "eventAddress", "eventCity", "eventCountry", "prizeType", "prizeValue", "prizeDescription", "prizeDistribution", "basePrizeAmountMinor", "entryFeeAmountMinor", "entryFee", "entryType", "sponsorReady", "sponsorEnabled", "participantCapacity", "maxParticipants", "capacityMode", "waitlistEnabled", "format", "participationMode", "teamConfig", "voting", "submissionDurationHours", "votingDurationHours", "creatorMediaVerification", "currentReviewRevision"];
fields.push("confirmedCreatorPrizeFundingCents", "creatorPrizeFundingStatus", "privateAccessMethod", "privateJoiningPolicy", "privateVotingAccess", "publicPreviewEnabled", "monetization", "votingSettings", "mediaVerification", "reviewRevisionNumber");
fields.push("rules", "roundPlan", "seedingMethod", "resultMethod", "tieBreaker", "thirdPlaceMethod", "scoreVisibility", "judging", "eligibility", "registrationType", "tournamentStartsAt", "expectedEndAt", "requiresCheckIn", "checkInClosesAt", "privacy", "timezone", "prizePool", "prizePlacements", "confirmedPrizePoolMinor", "sponsorship");
fields.push("publicationHoldReason");
export async function GET(request: Request) {
  const auth = await requireAdminPermission(request, "challenges.view"); if (auth.response) return auth.response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Challenge review");
  const url = new URL(request.url), id = url.searchParams.get("id");
  try {
    if (id) {
      if (id.includes("/") || id.length > 1500) return fail("Invalid review record.", 422);
      const source = url.searchParams.get("source") === "tournaments" ? "tournaments" : "challenges";
      const snap = await db.collection(source).doc(id).get(); if (!snap.exists) return fail("Review record not found.", 404);
      const record = snap.data() ?? {};
      const history = await db.collection(source === "tournaments" ? "tournamentAuditEvents" : "challengeReviewDecisions").where(source === "tournaments" ? "tournamentId" : "challengeId", "==", id).limit(101).get();
      const creator = String(record.creatorId ?? record.hostId ?? ""); const profile = creator ? await db.collection("profiles").doc(creator).get() : null;
      return ok({ id, source, kind: reviewKind(record, source), state: reviewState(record), record: Object.fromEntries(fields.filter(field => field in record).map(field => [field, record[field]])), creator: { id: creator, displayName: profile?.data()?.displayName ?? record.creatorName ?? record.hostName ?? "Unavailable" }, history: history.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as Record<string, unknown>).createdAt).localeCompare(String((a as Record<string, unknown>).createdAt))), historyTruncated: history.size > 100 });
    }
    return ok(await listChallengeReviews(db, { cursor: url.searchParams.get("cursor") ?? undefined, kind: url.searchParams.get("kind") ?? "all", status: url.searchParams.get("status") ?? "pending_review", search: (url.searchParams.get("q") ?? "").slice(0, 120), direction: url.searchParams.get("direction") ?? "asc" }));
  } catch (error) {
    if (error instanceof ChallengeAdminReviewError) return fail("The review cursor is invalid. Reload the queue.", error.status, undefined, error.code);
    console.warn("[challenge-review-query]", { code: (error as { code?: unknown })?.code ?? "QUERY_FAILED" });
    return fail("The review queue could not be loaded. Retry or contact Support; this is not an empty queue.", 503, undefined, "REVIEW_QUERY_UNAVAILABLE");
  }
}
export async function PATCH(request: Request) {
  const auth = await requireAdminPermission(request, "challenges.review"); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = parsed.body ?? {}, id = String(body.id ?? "");
  if (!id || id.includes("/") || id.length > 1500 || !["approve", "reject", "request_changes"].includes(String(body.action))) return fail("Select a valid review action and record.", 422);
  if (body.confirmed !== true) return fail("Confirm that you reviewed this submission before saving a decision.", 422, undefined, "REVIEW_CONFIRMATION_REQUIRED");
  const db = getAdminDb(); if (!db) return serverUnavailable("Challenge review");
  if (body.source === "tournaments") return reviewTournament(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  try { return ok(await decideChallengeReview(db, { id, actorId: auth.user!.uid, action: String(body.action), reason: String(body.reason ?? "").slice(0, 1000), expectedUpdatedAt: body.expectedUpdatedAt }), "Review decision saved."); }
  catch (error) {
    if (error instanceof ChallengeAdminReviewError) return fail(({REVIEW_REASON_REQUIRED:"Explain the decision in at least eight characters.",SELF_REVIEW_PROHIBITED:"You cannot review your own challenge.",REVIEW_MEDIA_NOT_VERIFIED:"Submitted media needs verification before approval.",CREATOR_PRIZE_FUNDING_REQUIRED:"Confirmed creator funding must cover the Base Prize before approval."} as Record<string,string>)[error.code] ?? "This review changed or is unavailable. Refresh before retrying.", error.status, undefined, error.code);
    return fail("The decision could not be saved. Refresh before retrying.", 503, undefined, "REVIEW_DECISION_UNAVAILABLE");
  }
}
