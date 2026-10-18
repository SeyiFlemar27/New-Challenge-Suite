import { getAdminDb } from "@/lib/firebase/admin";
import { getRequestUser } from "@/lib/server/auth";
import { eventGuestActor } from "@/lib/server/live-event-guests";
import { publicTicket } from "@/lib/server/live-event-admission";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Your tickets");
  const { id } = await params;
  const user = await getRequestUser(request) ?? await eventGuestActor(db, request, id);
  if (!user) return fail("Verify your email to retrieve your tickets.", 401);
  const tickets = await db.collection("liveEventTickets").where("userId", "==", user.uid).where("eventId","==",id).limit(501).get();
  if(tickets.size>500)return fail("Your event tickets need a larger retrieval page. Contact Support; no ticket has been assumed missing.",503);
  const result = ok({ tickets: tickets.docs.map(row => ({ ...publicTicket(row.data()),credential:["confirmed","checked_in"].includes(row.data().status)?row.data().credential:null,convertedToTicketId:row.data().convertedToTicketId??null,upgradeBookingId:row.data().status==="upgrade_pending"?row.data().upgradeBookingId??null:null,admissionReused:Boolean(row.data().admissionSourceTicketId) })) });
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}
