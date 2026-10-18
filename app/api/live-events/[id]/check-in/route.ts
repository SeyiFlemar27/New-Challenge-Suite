import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { inspectLiveEventTicket } from "@/lib/server/live-event-admission";
import { LiveEventPolicyError } from "@/lib/live-event-policy";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Event check-in");
  const { id } = await params;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  if (typeof body.ticketId !== "string" || typeof body.confirm !== "boolean" || (body.credential !== undefined && typeof body.credential !== "string")) return fail("Choose a ticket to verify before confirming arrival.", 422);
  const access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  try {
    const result = await inspectLiveEventTicket(db, { eventId: id, actor: { uid: user.uid, managementAuthorized: !access.response && Boolean(access.user) }, ticketId: body.ticketId, credential: body.credential, confirm: body.confirm, competitorIdentityConfirmed: body.competitorIdentityConfirmed === true });
    return ok(result, body.confirm ? (result.alreadyCheckedIn ? "This ticket has already been used." : "Arrival confirmed.") : "Ticket verified. Confirm arrival when the guest is present.");
  } catch (error) {
    if (error instanceof LiveEventPolicyError) return fail(error.status === 403 ? "Only the event organizer or authorized check-in staff can confirm arrival." : "This ticket cannot be admitted. Check the ticket, event and check-in times.", error.status, undefined, error.code);
    return fail("We couldn't verify this ticket. Please try again.", 500);
  }
}
