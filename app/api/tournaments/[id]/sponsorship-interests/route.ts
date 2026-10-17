import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { fail, ok, readJson, serverError } from "@/lib/server/responses";
import { sponsorTermsFingerprint, tournamentSponsorFundingWindow } from "@/lib/server/sponsor-subject";

export const dynamic = "force-dynamic";
async function access(request: Request, id: string) {
  const auth = await requireRequestUser(request);
  if (auth.response || !auth.user) return { response: auth.response! };
  const db = getAdminDb();
  if (!db) return { response: serverError("Tournament management is unavailable.") };
  const tournament = await db.collection("tournaments").doc(id).get();
  if (!tournament.exists || !canEditTournament({ ...auth.user }, tournament.data() ?? {}).allowed) return { response: fail("Tournament management permission required.", 403, undefined, "PERMISSION_DENIED") };
  return { db, user: auth.user, response: null, canApprove: auth.user.isAdmin === true || auth.user.role === "admin" || tournament.data()?.hostId === auth.user.uid };
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, result = await access(request, id);
  if (result.response || !result.db) return result.response;
  const agreements = await result.db.collection("sponsorChallengeAgreements").where("tournamentId", "==", id).get();
  return ok({ interests: agreements.docs.map(doc => ({ id: doc.id, ...doc.data() })), canApprove: result.canApprove === true }, "Tournament sponsorship agreements loaded.");
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, result = await access(request, id);
  if (result.response || !result.db || !result.user) return result.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body as Record<string, unknown> | null;
  if (!body || body.confirmed !== true || typeof body.agreementId !== "string" || !/^[\w-]{1,180}$/.test(body.agreementId)
    || !["accept", "reject"].includes(String(body.action)) || typeof body.reason !== "string" || body.reason.trim().length < 5) return fail("Confirm the decision and provide a reason of at least five characters.", 422, undefined, "CONFIRMATION_REASON_REQUIRED");
  const db = result.db, actor = result.user, agreementId = body.agreementId, action = String(body.action), reason = body.reason.trim().slice(0, 1000);
  try {
    const decision = await db.runTransaction(async transaction => {
      const ref = db.collection("sponsorChallengeAgreements").doc(agreementId);
      const [snapshot, tournament] = await Promise.all([transaction.get(ref), transaction.get(db.collection("tournaments").doc(id))]);
      const agreement = snapshot.data() ?? {};
      const record = tournament.data() ?? {};
      const mayApproveFinancialTerms = actor.isAdmin === true || actor.role === "admin" || record.hostId === actor.uid;
      if (!snapshot.exists || agreement.tournamentId !== id || agreement.subjectType !== "tournament" || !tournament.exists || !mayApproveFinancialTerms) throw new Error("PERMISSION_DENIED");
      if (!tournamentSponsorFundingWindow(tournament.data() ?? {}).allowed) throw new Error("SPONSOR_WINDOW_CLOSED");
      const next = action === "accept" ? "awaiting_sponsor_acceptance" : "rejected";
      if (agreement.status === next) return { duplicate: true, status: next };
      if (agreement.status !== "interest_submitted") throw new Error("TERMS_LOCKED");
      const fingerprint = sponsorTermsFingerprint(agreement.terms ?? {});
      if (agreement.termsFingerprint !== fingerprint) throw new Error("TERMS_CHANGED");
      const now = new Date().toISOString();
      const update = { status: next, updatedAt: now, ...(action === "accept" ? { creatorAcceptedFingerprint: fingerprint, creatorAcceptedVersion: agreement.termsVersion, creatorAcceptedAt: now, creatorAcceptedBy: actor.uid } : { rejectedAt: now, rejectedBy: actor.uid }) };
      transaction.set(ref, update, { merge: true });
      const auditRef = db.collection("tournamentAuditEvents").doc(`${agreementId}_${action}`);
      transaction.create(auditRef, { tournamentId: id, agreementId, actorId: actor.uid, action: `sponsor_terms_${action}`, reason, confirmed: true, before: { status: agreement.status, termsFingerprint: agreement.termsFingerprint }, after: update, metadata: { sponsorUserId: agreement.sponsorSubmittedBy ?? null }, createdAt: now });
      return { duplicate: false, status: next };
    });
    return ok(decision, "Sponsorship decision recorded.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "DECISION_FAILED";
    return fail("The agreement could not be changed. Refresh its status and funding eligibility.", code === "PERMISSION_DENIED" ? 403 : 409, undefined, code);
  }
}
