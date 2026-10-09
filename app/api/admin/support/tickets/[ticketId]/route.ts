import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { response } = await requireAdminPermission(request, "tickets.view"); if (response) return response;
  const { ticketId } = await params; const db = getAdminDb(); if (!db) return serverUnavailable("Admin support ticket");
  const ref = db.collection("supportTickets").doc(ticketId); const ticket = await ref.get();
  if (!ticket.exists) return fail("Ticket not found.", 404);
  const messages = await ref.collection("messages").orderBy("createdAt", "asc").limit(200).get();
  return ok({ ticket: { id: ticket.id, ...ticket.data() }, messages: messages.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
}
