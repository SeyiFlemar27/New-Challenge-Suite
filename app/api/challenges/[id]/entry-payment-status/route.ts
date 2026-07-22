import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Paid entry status");
  const { id: challengeId } = await params;
  const paymentId = `challenge_entry_${challengeId}_${user.uid}`;
  const [paymentSnap, participantSnap] = await Promise.all([
    db.collection("challengeEntryPayments").doc(paymentId).get(),
    db.collection("challengeParticipants").doc(`${challengeId}_${user.uid}`).get()
  ]);
  const payment = paymentSnap.exists ? { id: paymentSnap.id, ...paymentSnap.data() } as Record<string, unknown> & { id: string } : null;
  const participant = participantSnap.exists ? { id: participantSnap.id, ...participantSnap.data() } as Record<string, unknown> & { id: string } : null;
  if (payment && payment.userId !== user.uid) return fail("Paid entry status not found.", 404, undefined, "NOT_FOUND");
  return ok({
    payment,
    participant,
    status: payment?.status ?? participant?.entryPaymentStatus ?? "not_started",
    webhookConfirmationRequired: true,
    checkoutSuccessActivatesEntry: false
  }, "Paid entry status loaded.");
}
