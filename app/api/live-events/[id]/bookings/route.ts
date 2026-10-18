import { getAdminDb } from "@/lib/firebase/admin";
import { getRequestUser } from "@/lib/server/auth";
import { eventGuestActor } from "@/lib/server/live-event-guests";
import { validLiveEventRequestOrigin } from "@/lib/server/live-event-request-origin";
import { bookFreeLiveEvent } from "@/lib/server/live-event-admission";
import { LiveEventPolicyError } from "@/lib/live-event-policy";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Your booking");
  const { id } = await params, bookingId = new URL(request.url).searchParams.get("bookingId");
  const user = await getRequestUser(request) ?? await eventGuestActor(db, request, id);
  if (!user) return fail("Verify your email to retrieve your booking.", 401);
  if (!bookingId || !/^[a-f0-9]{64}$/.test(bookingId)) return fail("Booking not found.", 404);
  const snapshot = await db.collection("liveEventBookings").doc(bookingId).get(), booking = snapshot.data();
  if (!booking || booking.eventId !== id || booking.userId !== user.uid) return fail("Booking not found.", 404);
  const response = ok({ booking: { id: snapshot.id, status: booking.status, expiresAt: booking.reservationExpiresAt ?? null, amountCents: booking.amountCents, currency: booking.currency, quantity: booking.quantity ?? booking.ticketIds?.length ?? 0, kind: booking.kind, ticketIds: booking.status === "confirmed" ? booking.ticketIds : [] } });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Event tickets");
  const { id } = await params;
  if (!validLiveEventRequestOrigin(request)) return fail("This request couldn't be verified.", 403);
  const user = await getRequestUser(request) ?? await eventGuestActor(db, request, id);
  if (!user) return fail("Verify your email before getting tickets.", 401);
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  if (!Array.isArray(body.names) || body.names.some((value: unknown) => typeof value !== "string") || !["audience", "competitor"].includes(body.kind) || typeof body.requestKey !== "string") return fail("Add the names for your tickets and choose an admission type.", 422);
  if (body.kind === "competitor" && "guestSession" in user && user.guestSession === true) return fail("Sign in to your Challenge Suite account to compete.", 403);
  try {
    return ok(await bookFreeLiveEvent(db, { eventId: (await params).id, actor: user, names: body.names, kind: body.kind, announcementEmailConsent: body.announcementEmailConsent === true, upgradeTicketId:typeof body.upgradeTicketId==="string"?body.upgradeTicketId:undefined,personalAdmissionConfirmed:body.personalAdmissionConfirmed===true,requestKey: body.requestKey }), body.kind === "competitor" ? "You're officially in!" : "You're on the guest list!");
  } catch (error) {
    if (error instanceof LiveEventPolicyError) return fail(error.code === "PAID_BOOKING_UNAVAILABLE" ? "Paid bookings aren't available for this event yet." : error.code === "VERIFIED_EMAIL_REQUIRED" ? "Verify your email before getting tickets." : error.code === "COMPETITION_FULL" ? "Competition Full" : error.code === "AUDIENCE_FULL" ? "Audience tickets are sold out." : "This booking couldn't be completed. Check availability and try again.", error.status, undefined, error.code);
    return fail("We couldn't secure your place. Please try again.", 500);
  }
}
