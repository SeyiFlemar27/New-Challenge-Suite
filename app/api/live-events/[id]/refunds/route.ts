import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { getRequestUser } from "@/lib/server/auth";
import { eventGuestActor } from "@/lib/server/live-event-guests";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { validLiveEventRequestOrigin } from "@/lib/server/live-event-request-origin";
import { queueLiveEventPassRefunds, executeLiveEventRefund } from "@/lib/server/live-event-refunds";
import { LiveEventPolicyError } from "@/lib/live-event-policy";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validLiveEventRequestOrigin(request)) return fail("This request couldn't be verified.", 403);
  const db = getAdminDb();
  if (!db) return serverUnavailable("Ticket refunds");
  const { id } = await params, account = await getRequestUser(request), actor = account ?? await eventGuestActor(db, request, id);
  if (!actor) return fail("Verify your email before managing tickets.", 401);
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  if (body.confirmed !== true || typeof body.ticketId !== "string" || typeof body.reason !== "string" || typeof body.requestKey !== "string") return fail("Choose the ticket, add a reason and confirm your refund request.", 422);
  const access = account ? await requireChallengeManagementAccess(request, id, "finance.prepare") : null;
  try {
    const results = await queueLiveEventPassRefunds(db, { eventId: id, ticketId: body.ticketId, actorId: actor.uid, managementAuthorized: Boolean(access && !access.response && access.user), reason: body.reason, requestKey: body.requestKey });
    const stripe = process.env.LIVE_EVENT_AUTOMATIC_REFUNDS_ENABLED === "true" ? getStripe() : null;
    for(const result of results)if (stripe && result.status === "approved") await executeLiveEventRefund(db, stripe, result.refundCaseId);
    const cases=await db.getAll(...results.map(result=>db.collection("refundCases").doc(result.refundCaseId)));
    const states=cases.map(row=>({refundCaseId:row.id,status:row.data()?.status,amountCents:row.data()?.amountCents}));
    return ok({refundCaseId:states[0].refundCaseId,status:states[0].status,cases:states},states.every(row=>row.status==="refunded")?"The eligible refunds listed in your booking are provider-confirmed. Refunded admission cannot be used.":"Your eligible refund requests are recorded against their original payments. Pending or reviewed refunds are not complete.");
  } catch (error) {
    if (error instanceof LiveEventPolicyError) return fail(error.code === "VOLUNTARY_REFUND_UNAVAILABLE" ? "This ticket is not eligible for an ordinary refund under its booking policy, or a refund is already being reviewed." : "This refund needs review. Your payment record has been preserved.", error.status, undefined, error.code);
    return fail("Your refund couldn't be confirmed. Check its status before trying again.", 503);
  }
}
