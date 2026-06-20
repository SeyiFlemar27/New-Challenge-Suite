import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { subscriptionPlans } from "@/lib/server/subscriptions";
import { conflict, fail, forbidden, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";
import { logEmailDeliveryError, sendEmail } from "@/lib/server/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Event registrations");
  const [eventSnap, userSnap, profileSnap, existingRegistrationSnap] = await Promise.all([
    db.collection("liveEvents").doc(id).get(),
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("liveEventRegistrations").doc(`${id}_${user.uid}`).get()
  ]);
  if (!eventSnap.exists) return fail("Live event not found.", 404, { fieldErrors: { eventId: "Live event does not exist." } }, "NOT_FOUND");
  if (existingRegistrationSnap.exists) return conflict("You are already registered for this event.");

  const event = eventSnap.data() ?? {};
  const status = String(event.status ?? "scheduled").toLowerCase();
  if (["draft", "deleted", "cancelled", "closed", "completed"].includes(status)) {
    return conflict("This event is not open for registration.");
  }

  const capacity = Number(event.capacity ?? event.maxAttendees ?? 0);
  const attending = Number(event.attending ?? event.attendeeCount ?? event.registrationCount ?? 0);
  if (capacity && attending >= capacity) return conflict("This event is full.");
  const ticketPrice = Number(event.price ?? event.ticketPrice ?? 0);
  if (ticketPrice > 0) {
    return fail("Paid live event checkout is not configured yet.", 503, { fieldErrors: { payment: "Paid event registration requires a Stripe checkout route." } }, "PAYMENT_CONFIGURATION_ERROR");
  }

  const account = userSnap.exists ? userSnap.data() ?? {} : {};
  const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
  const currentPlanId = String(account.planId ?? profile.planId ?? "observer");
  const currentPlan = subscriptionPlans.find((item) => item.id === currentPlanId) ?? subscriptionPlans[0];
  const requiredPlanId = typeof event.requiredPlanId === "string" ? event.requiredPlanId : null;
  const requiredPlan = requiredPlanId ? subscriptionPlans.find((item) => item.id === requiredPlanId) : null;
  if (requiredPlan && requiredPlan.canHostLiveEvents && !currentPlan.canHostLiveEvents) {
    return forbidden("This live event requires an eligible subscription plan.");
  }

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const fieldErrors: Record<string, string> = {};
  if (!body?.fullName) fieldErrors.fullName = "Full name is required.";
  if (!body?.email) fieldErrors.email = "Email is required.";
  if (!body?.phone) fieldErrors.phone = "Phone is required.";
  if (body?.acceptedAgreement !== true) fieldErrors.acceptedAgreement = "Live event agreement is required.";
  if (Object.keys(fieldErrors).length) return validationError(fieldErrors);
  const ref = db.collection("liveEventRegistrations").doc(`${id}_${user.uid}`);
  const now = new Date().toISOString();
  const registration = { id: ref.id, eventId: id, userId: user.uid, fullName: body.fullName, email: body.email, phone: body.phone, notes: body.notes ?? "", ticketType: body.ticketType ?? "general", status: "confirmed", confirmationSent: false, emailStatus: "pending", acceptedAgreement: true, createdAt: now };
  try {
    await db.runTransaction(async (transaction) => {
      const currentEventSnap = await transaction.get(db.collection("liveEvents").doc(id));
      const currentRegistrationSnap = await transaction.get(ref);
      if (!currentEventSnap.exists) throw new Error("Live event not found.");
      if (currentRegistrationSnap.exists) throw new Error("You are already registered for this event.");
      const currentEvent = currentEventSnap.data() ?? {};
      const currentCapacity = Number(currentEvent.capacity ?? currentEvent.maxAttendees ?? 0);
      const currentAttending = Number(currentEvent.attending ?? currentEvent.attendeeCount ?? currentEvent.registrationCount ?? 0);
      if (currentCapacity && currentAttending >= currentCapacity) throw new Error("This event is full.");
      transaction.set(ref, registration);
      transaction.set(db.collection("liveEvents").doc(id), {
        registrationCount: currentAttending + 1,
        attendeeCount: currentAttending + 1,
        updatedAt: now
      }, { merge: true });
    });
  } catch (error) {
    return conflict(error instanceof Error ? error.message : "Event registration could not be completed.");
  }
  let emailWarning: string | null = null;
  try {
    await sendEmail({
      to: body.email,
      subject: `Registration confirmed: ${String(event.title ?? "Challenge Suite Live Event")}`,
      text: `Registration confirmed for ${String(event.title ?? "Challenge Suite Live Event")}.\nDate: ${String(event.date ?? event.startsAt ?? "")}\nLocation: ${String(event.location ?? event.venue ?? "")}`,
      html: `<p>Registration confirmed for <strong>${String(event.title ?? "Challenge Suite Live Event")}</strong>.</p><p>Date: ${String(event.date ?? event.startsAt ?? "")}</p><p>Location: ${String(event.location ?? event.venue ?? "")}</p>`
    });
    await ref.set({ confirmationSent: true, emailStatus: "sent", emailSentAt: new Date().toISOString() }, { merge: true });
    registration.confirmationSent = true;
    registration.emailStatus = "sent";
  } catch (error) {
    emailWarning = "Registered, but email could not be sent.";
    logEmailDeliveryError("live event registration confirmation failed", error, { eventId: id, userId: user.uid });
    await ref.set({ emailStatus: "failed", emailFailureReason: "EMAIL_SEND_FAILED", updatedAt: new Date().toISOString() }, { merge: true });
  }

  await createNotification(db, { userId: user.uid, type: "event_registration", title: "Event registration confirmed", body: emailWarning ?? "Event details have been sent to your email.", targetId: id });
  return ok({ registration, emailWarning }, emailWarning ?? "Event registration confirmed. Details were sent to your email.");
}
