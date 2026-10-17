import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament entry payment status");
  const { id: tournamentId } = await context.params;
  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim() ?? "";
  if (!sessionId || sessionId.length > 255) return fail("Checkout Session reference is required.", 400, undefined, "CHECKOUT_SESSION_REQUIRED");
  const paymentSnap = await db.collection("tournamentEntryPayments").where("providerSessionId", "==", sessionId).limit(1).get();
  const paymentDocument = paymentSnap.docs[0];
  if (!paymentDocument) return fail("Tournament payment is not available yet.", 404, undefined, "TOURNAMENT_PAYMENT_NOT_FOUND");
  const payment = paymentDocument.data();
  if (payment.tournamentId !== tournamentId) return fail("Tournament payment is not available.", 404, undefined, "TOURNAMENT_PAYMENT_NOT_FOUND");
  let authorized = payment.userId === user.uid;
  if (!authorized && !payment.teamAttemptId && payment.entrantType === "team" && payment.teamId) {
    const team = await db.collection("tournamentTeams").doc(String(payment.teamId)).get();
    authorized = team.exists && team.data()?.captainUserId === user.uid;
  }
  if (!authorized) return fail("You cannot view this Tournament payment.", 403, undefined, "TOURNAMENT_PAYMENT_FORBIDDEN");
  return ok({
    id: paymentDocument.id,
    status: String(payment.status ?? "pending"),
    refundStatus: String(payment.refundStatus ?? "not_required"),
    refundReason: typeof payment.refundReason === "string" ? payment.refundReason : null,
    reservationExpiresAt: String(payment.reservationExpiresAt ?? ""),
    confirmedAt: typeof payment.confirmedAt === "string" ? payment.confirmedAt : null
  }, "Tournament entry payment status loaded.");
}
