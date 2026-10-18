import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { configureLiveEventReminders, scheduleLiveEventAnnouncement } from "@/lib/server/live-event-communications";
import { validLiveEventRequestOrigin } from "@/lib/server/live-event-request-origin";
import { LiveEventPolicyError } from "@/lib/live-event-policy";
import { fail, ok, readJson } from "@/lib/server/responses";

export async function PATCH(request: Request, {params}: {params: Promise<{id: string}>}) {
  if(!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  const {id}=await params, access=await requireChallengeManagementAccess(request,id,"challenge.edit");
  if(access.response||!access.db||!access.user)return access.response;
  const parsed=await readJson(request);if(parsed.response)return parsed.response;
  const body=parsed.body;
  if(!body||!Array.isArray(body.hours))return fail("Choose the reminders for this event.",422);
  try{return ok(await configureLiveEventReminders(access.db,{eventId:id,actorId:access.user.uid,hours:body.hours}),"Your reminder settings have been saved.");}
  catch(error){return fail("These reminders couldn't be saved. Check that the event hasn't started.",error instanceof LiveEventPolicyError?error.status:500);}
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.db) return access.response;
  const [messages, outbox] = await Promise.all([access.db.collection("liveEventAnnouncements").where("eventId", "==", id).limit(100).get(), access.db.collection("liveEventEmailOutbox").where("eventId", "==", id).limit(1000).get()]);
  const response = ok({ reminderHours: Array.isArray(access.challenge?.liveEventReminderHours) ? access.challenge.liveEventReminderHours : [24,1], sendingAvailable: process.env.LIVE_EVENT_LIFECYCLE_SCHEDULER_ENABLED === "true" && process.env.LIVE_EVENT_EMAIL_DELIVERY_ENABLED === "true", messages: messages.docs.map(row => ({ id: row.id, title: row.data().title, message: row.data().message, audience: row.data().audience, runAt: row.data().runAt, status: row.data().status })), delivery: { accepted: outbox.docs.filter(row => row.data().status === "accepted").length, pending: outbox.docs.filter(row => ["pending", "retry_pending", "sending"].includes(row.data().status)).length, reviewRequired: outbox.docs.filter(row => row.data().status === "review_required").length, inboxDeliveryVerified: false, truncated: outbox.size === 1000 } });
  response.headers.set("Cache-Control", "private, no-store"); return response;
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validLiveEventRequestOrigin(request)) return fail("This request couldn't be verified.", 403);
  const { id } = await params, access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.db || !access.user) return access.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  if (typeof body.title !== "string" || typeof body.message !== "string" || typeof body.runAt !== "string" || typeof body.requestKey !== "string") return fail("Add a title, message and sending time, then preview your announcement.", 422);
  try { return ok(await scheduleLiveEventAnnouncement(access.db, { eventId: id, actorId: access.user.uid, title: body.title, message: body.message, audience: body.audience, runAt: body.runAt, requestKey: body.requestKey, confirmed: body.confirmed === true }), "Your announcement is queued. Sending depends on the event's configured messaging service."); }
  catch (error) { return fail("Your announcement couldn't be queued. Check the event, recipients and sending time.", error instanceof LiveEventPolicyError ? error.status : 500); }
}
