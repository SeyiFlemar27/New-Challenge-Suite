import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Paid entry status");
  const { id: challengeId } = await params;
  const paymentId = `challenge_entry_fee_${challengeId}_${user.uid}`;
  const legacyPaymentId = `challenge_entry_${challengeId}_${user.uid}`;
  const [paymentSnap, legacyPaymentSnap, participantSnap, submissionSnap] = await Promise.all([
    db.collection("challengeEntryPayments").doc(paymentId).get(),
    db.collection("challengeEntryPayments").doc(legacyPaymentId).get(),
    db.collection("challengeParticipants").doc(`${challengeId}_${user.uid}`).get(),
    db.collection("submissions").doc(`${challengeId}_${user.uid}`).get()
  ]);
  const activePaymentSnap = paymentSnap.exists ? paymentSnap : legacyPaymentSnap;
  const payment = activePaymentSnap.exists ? { id: activePaymentSnap.id, ...activePaymentSnap.data() } as Record<string, unknown> & { id: string } : null;
  const participant = participantSnap.exists ? { id: participantSnap.id, ...participantSnap.data() } as Record<string, unknown> & { id: string } : null;
  const submission = submissionSnap.exists ? { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown> & { id: string } : null;
  if (payment && payment.userId !== user.uid) return fail("Paid entry status not found.", 404, undefined, "NOT_FOUND");
  const enrolled = Boolean(participant && ["paid", "confirmed"].includes(String(participant.entryPaymentStatus ?? "")));
  const pending = payment?.status === "pending" && payment?.reservationStatus === "reserved";
  return ok({
    payment,
    participant,
    submission,
    status: enrolled ? "paid" : payment?.status ?? participant?.entryPaymentStatus ?? "not_started",
    enrolled,
    pending,
    submitted: Boolean(submission),
    webhookConfirmationRequired: true,
    checkoutSuccessActivatesEntry: false
  }, "Paid entry status loaded.");
}