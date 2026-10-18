import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { getRequestUser } from "@/lib/server/auth";
import { eventGuestActor } from "@/lib/server/live-event-guests";
import { createLiveEventCheckout,expireLiveEventCheckout } from "@/lib/server/live-event-checkout";
import { validLiveEventRequestOrigin } from "@/lib/server/live-event-request-origin";
import { LiveEventPolicyError } from "@/lib/live-event-policy";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validLiveEventRequestOrigin(request)) return fail("This request couldn't be verified.", 403);
  // Remains opt-in while refund, provider and operational verification are incomplete.
  if (process.env.LIVE_EVENT_PAID_CHECKOUT_ENABLED !== "true") return serverUnavailable("Paid event booking");
  const db = getAdminDb(), stripe = getStripe();
  if (!db || !stripe) return serverUnavailable("Paid event booking");
  const { id } = await params;
  const actor = await getRequestUser(request) ?? await eventGuestActor(db, request, id);
  if (!actor) return fail("Verify your email before booking.", 401);
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  if (!Array.isArray(body.names) || body.names.some((name: unknown) => typeof name !== "string") || !["audience", "competitor"].includes(body.kind) || typeof body.requestKey !== "string") return fail("Add the ticket names and choose an admission type.", 422);
  try {
    return ok(await createLiveEventCheckout(db, stripe, { eventId: id, actor, names: body.names, kind: body.kind, announcementEmailConsent: body.announcementEmailConsent === true, upgradeTicketId:typeof body.upgradeTicketId==="string"?body.upgradeTicketId:undefined,personalAdmissionConfirmed:body.personalAdmissionConfirmed===true,newAdmissionConfirmed:body.newAdmissionConfirmed===true,requestKey: body.requestKey, origin: new URL(request.headers.get("origin")!).origin }), "Your spaces are reserved while you complete payment.");
  } catch (error) {
    if (error instanceof LiveEventPolicyError) return fail(error.code === "ADMISSION_REUSE_REVIEW_REQUIRED" ? "You already have audience admission. Contact Support to verify its reuse before paying for competition entry; no second admission has been charged." : error.code === "RESERVATION_EXPIRED" ? "Your reservation has expired. Check availability before trying again." : error.code === "AUDIENCE_FULL" ? "Audience tickets are sold out." : error.code === "COMPETITION_FULL" ? "Competition Full" : "Checkout couldn't be started. Check your booking and try again.", error.status, undefined, error.code);
    return fail("Checkout couldn't be confirmed. Check your booking before retrying; no ticket has been issued yet.", 503);
  }
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  if(process.env.LIVE_EVENT_PAID_CHECKOUT_ENABLED!=="true")return serverUnavailable("Checkout cancellation");
  const db=getAdminDb(),stripe=getStripe();if(!db||!stripe)return serverUnavailable("Checkout cancellation");
  const {id}=await params,actor=await getRequestUser(request)??await eventGuestActor(db,request,id);if(!actor)return fail("Verify your booking identity.",401);
  const parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(body.confirmed!==true||typeof body.bookingId!=="string"||!/^[a-f0-9]{64}$/.test(body.bookingId))return fail("Confirm the checkout cancellation.",422);
  const booking=await db.collection("liveEventBookings").doc(body.bookingId).get();if(!booking.exists||booking.data()?.eventId!==id||booking.data()?.userId!==actor.uid)return fail("Booking not found.",404);
  try{const result=await expireLiveEventCheckout(db,stripe,body.bookingId,true);return ok(result,result.released?"Unpaid checkout cancelled. Eligible original admission has been restored.":"Cancellation needs payment verification. Check your booking or contact Support; no admission or refund has been assumed.");}
  catch{return fail("The provider couldn't verify cancellation. Your original records are preserved; contact Support before retrying payment.",409);}
}
