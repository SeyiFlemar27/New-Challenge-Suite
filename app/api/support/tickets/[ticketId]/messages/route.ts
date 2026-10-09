import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { mayReopenSupportTicket } from "@/lib/server/support-tickets";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireRequestUser(request); if (response) return response;
  const { ticketId } = await params; const db = getAdminDb(); if (!db) return serverUnavailable("Support messages");
  const ref = db.collection("supportTickets").doc(ticketId); const ticket = await ref.get();
  if (!ticket.exists || ticket.data()?.userId !== user!.uid) return fail("Ticket not found.", 404);
  const messages = await ref.collection("messages").orderBy("createdAt", "asc").limit(200).get();
  return ok({ ticket: { id: ticket.id, ...ticket.data() }, messages: messages.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
}

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireRequestUser(request); if (response) return response;
  const { ticketId } = await params; const db = getAdminDb(); if (!db) return serverUnavailable("Support reply");
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = typeof parsed.body?.message === "string" ? parsed.body.message.trim() : "";
  if (!body || body.length > 5000) return validationError({ message: "Reply must contain 1 to 5,000 characters." });
  const key = request.headers.get("idempotency-key")?.trim() || createHash("sha256").update(`${user!.uid}:${ticketId}:${body}`).digest("hex");
  const messageId = `user_${createHash("sha256").update(key).digest("hex")}`;
  const ticketRef = db.collection("supportTickets").doc(ticketId); const messageRef = ticketRef.collection("messages").doc(messageId);
  try {
    const now = new Date().toISOString(); let duplicate = false;
    await db.runTransaction(async (transaction) => {
      const [ticketSnap, messageSnap] = await Promise.all([transaction.get(ticketRef), transaction.get(messageRef)]);
      if (!ticketSnap.exists || ticketSnap.data()?.userId !== user!.uid) throw new Error("NOT_FOUND");
      if (messageSnap.exists) { duplicate = true; return; }
      const ticket = ticketSnap.data() ?? {};
      if (!mayReopenSupportTicket(ticket, Date.now())) throw new Error("REOPEN_WINDOW_EXPIRED");
      const wasResolved = ticket.status === "resolved";
      transaction.create(messageRef, { id: messageId, authorType: "user", authorId: user!.uid, body, createdAt: now, idempotencyKeyHash: createHash("sha256").update(key).digest("hex") });
      transaction.set(ticketRef, { status: wasResolved ? "reopened" : "waiting_for_admin", reopenedAt: wasResolved ? now : ticket.reopenedAt ?? null, lastUserResponseAt: now, updatedAt: now, resolvedAt: wasResolved ? null : ticket.resolvedAt ?? null, reopenUntil: wasResolved ? null : ticket.reopenUntil ?? null }, { merge: true });
    });
    return ok({ ticketId, messageId, duplicate }, duplicate ? "Reply already recorded." : "Reply sent to Support.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Ticket not found.", 404);
    if (error instanceof Error && error.message === "REOPEN_WINDOW_EXPIRED") return fail("This resolved ticket can no longer be reopened. Create a new support ticket.", 409);
    return serverError("Support reply could not be saved.", error instanceof Error ? error.message : error);
  }
}
