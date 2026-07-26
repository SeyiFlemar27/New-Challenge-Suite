import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { tournamentSponsorPrizeState } from "@/lib/server/tournament-operations";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament sponsorship proposals");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await context.params;
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = tournamentSnap.data() ?? {};
  if (!((tournament.sponsorship as Record<string, unknown> | undefined)?.sponsorReady || body.acceptSponsorshipProposals === true)) return fail("Tournament is not accepting sponsorship proposals.", 403, undefined, "TOURNAMENT_NOT_SPONSOR_READY");
  const ref = db.collection("tournamentSponsorProposals").doc();
  const proposal = { id: ref.id, tournamentId: id, sponsorId: user.uid, budgetMinor: Math.max(0, Math.trunc(Number(body.budgetMinor ?? 0))), message: String(body.message ?? "").slice(0, 1000), desiredPlacement: String(body.desiredPlacement ?? "").slice(0, 160), campaignGoal: String(body.campaignGoal ?? "").slice(0, 240), cta: String(body.cta ?? "").slice(0, 160), requestedDeliverables: Array.isArray(body.requestedDeliverables) ? body.requestedDeliverables.slice(0, 8) : [], status: "pending", paymentConfirmed: false, publicDisplayApproved: false, prizeState: tournamentSponsorPrizeState({ sponsorProposalsAccepted: true }), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await ref.set(proposal);
  return ok({ proposal }, "Tournament sponsorship proposal submitted. Sponsor funding and branding require approval and provider-confirmed payment.");
}
