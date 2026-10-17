import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { createTournamentEntryCheckout } from "@/lib/server/tournament-paid-entry";
import { isTournamentV3SchedulingReady } from "@/lib/server/tournament-cloud-tasks";
import { TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Team payment status");
  const { id } = await context.params;
  const membership = await db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`).get();
  if (membership.data()?.status !== "active") return fail("Active team membership is required.", 403, undefined, "TEAM_MEMBERSHIP_REQUIRED");
  const team = await db.collection("tournamentTeams").doc(String(membership.data()?.teamId)).get();
  if (!team.exists || team.data()?.tournamentId !== id || !Array.isArray(team.data()?.memberUserIds) || !team.data()?.memberUserIds.includes(user.uid)) return fail("Active team membership is required.", 403, undefined, "TEAM_MEMBERSHIP_REQUIRED");
  const attemptId = String(team.data()?.activeRegistrationAttemptId ?? team.data()?.latestRegistrationAttemptId ?? "");
  if (!attemptId) return ok({ status: "not_started", members: [], ownPaymentStatus: "not_started", teamRegistered: Boolean(team.data()?.slotReservedAt) }, "The captain has not started team registration.");
  const attempt = await db.collection("tournamentTeamRegistrationAttempts").doc(attemptId).get();
  if (!attempt.exists || attempt.data()?.tournamentId !== id || attempt.data()?.teamId !== team.id) return fail("The team payment attempt requires review.", 409, undefined, "TEAM_ATTEMPT_REFERENCE_MISMATCH");
  const paymentIds = attempt.data()?.paymentIds;
  if (!Array.isArray(paymentIds) || paymentIds.length < 1 || paymentIds.length > 20) return fail("The team payment attempt requires review.", 409, undefined, "TEAM_ATTEMPT_REFERENCE_MISMATCH");
  const payments = await db.getAll(...paymentIds.map(paymentId => db.collection("tournamentEntryPayments").doc(String(paymentId))));
  const members = payments.filter(payment => payment.data()?.teamAttemptId === attemptId && payment.data()?.tournamentId === id).map(payment => ({ userId: String(payment.data()?.userId), status: String(payment.data()?.status ?? "pending") }));
  const ownPayment = members.find(member => member.userId === user.uid);
  return ok({ status: String(attempt.data()?.status), expiresAt: String(attempt.data()?.expiresAt), members, ownPaymentStatus: ownPayment?.status ?? "unavailable", teamRegistered: Boolean(team.data()?.slotReservedAt && team.data()?.paymentStatus === "confirmed") }, "Team payment state verified from server records.");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Member entry payment");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const { id } = await context.params;
  const tournament = await db.collection("tournaments").doc(id).get();
  if (tournament.data()?.productPolicyVersion !== TOURNAMENT_PRODUCT_POLICY) return fail("This Tournament does not use individual team-member payments.", 409, undefined, "TEAM_PAYMENT_MODEL_MISMATCH");
  if (process.env.TOURNAMENT_ENTRY_PAYMENTS_ENABLED !== "true" || (process.env.NODE_ENV === "production" && !isTournamentV3SchedulingReady())) return fail("Tournament payments are not enabled or scheduling is unavailable.", 503, undefined, "TOURNAMENT_PAYMENT_DISABLED");
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!stripe || !appUrl) return fail("Entry payment processing is not configured.", 503, undefined, "PAYMENT_CONFIGURATION_ERROR");
  const membership = await db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`).get();
  if (membership.data()?.status !== "active") return fail("Active team membership is required.", 403, undefined, "TEAM_MEMBERSHIP_REQUIRED");
  try {
    const checkout = await createTournamentEntryCheckout(db, stripe, { tournamentId: id, target: { mode: "team", teamId: String(membership.data()?.teamId), userId: user.uid }, rulesAccepted: (parsed.body as Record<string, unknown>)?.rulesAccepted === true, appUrl });
    return ok({ checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt, paymentStatus: "pending" }, "This checkout covers only your own entry fee. The team registers after every required payment is verified.");
  } catch (error) {
    const failure = error as Error & { status?: number; code?: string };
    if (Number.isInteger(failure.status) && Number(failure.status) >= 400 && Number(failure.status) < 500) return fail(failure.message, Number(failure.status), undefined, failure.code);
    return serverUnavailable("Member entry checkout");
  }
}
