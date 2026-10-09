import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { serverError, serverUnavailable } from "@/lib/server/responses";
import { mayReopenSupportTicket, supportInboundMessageId, supportInboundTicketNumber } from "@/lib/server/support-tickets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validSignature(raw: string, request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = request.headers.get("svix-id"); const timestamp = request.headers.get("svix-timestamp"); const signatures = request.headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signatures || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest();
  return signatures.split(" ").some((item) => {
    const value = item.split(","); if (value.length !== 2 || value[0] !== "v1") return false;
    try { const received = Buffer.from(value[1], "base64"); return received.length === expected.length && timingSafeEqual(received, expected); } catch { return false; }
  });
}

function emailAddress(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw.match(/<([^>]+)>/)?.[1]?.trim() ?? raw;
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request)) return new Response("Invalid webhook signature.", { status: 401 });
  let event: Record<string, unknown>;
  try { event = JSON.parse(raw) as Record<string, unknown>; } catch { return new Response("Invalid JSON.", { status: 400 }); }
  if (event.type !== "email.received") return new Response("Event ignored.", { status: 200 });
  const data = event.data as Record<string, unknown> | undefined;
  const ticketNumber = supportInboundTicketNumber(data?.to);
  const emailId = String(data?.email_id ?? "");
  const apiKey = process.env.RESEND_API_KEY;
  if (!ticketNumber || !emailId || !apiKey) return new Response("Inbound message is not configured or address is not a ticket reply.", { status: 202 });
  let received: Record<string, unknown>;
  try {
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) return new Response("Received email content is temporarily unavailable.", { status: 503 });
    const payload = await response.json() as Record<string, unknown>;
    received = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  } catch { return new Response("Received email content is temporarily unavailable.", { status: 503 }); }
  const db = getAdminDb(); const auth = getAdminAuth();
  if (!db || !auth) return serverUnavailable("Support inbound email");
  try {
    const match = await db.collection("supportTickets").where("ticketNumber", "==", ticketNumber).limit(1).get();
    if (match.empty) return new Response("Ticket not found.", { status: 202 });
    const ticketRef = match.docs[0].ref; const ticket = match.docs[0].data();
    const sender = emailAddress(received.from ?? data?.from);
    const account = await auth.getUser(String(ticket.userId ?? ""));
    if (!sender || sender !== String(account.email ?? ticket.userEmail ?? "").toLowerCase()) return new Response("Sender is not the ticket owner.", { status: 403 });
    const text = String(received.text ?? received.html ?? "").trim();
    if (!text || text.length > 10000) return new Response("Reply content is empty or exceeds the limit.", { status: 400 });
    const providerMessageId = String(received.message_id ?? data?.message_id ?? event.id ?? emailId);
    const messageId = supportInboundMessageId(providerMessageId);
    const eventId = String(request.headers.get("svix-id"));
    const eventRef = db.collection("supportInboundEvents").doc(supportInboundMessageId(eventId));
    const messageRef = ticketRef.collection("messages").doc(messageId);
    const now = new Date().toISOString(); let ignored = false;
    await db.runTransaction(async (transaction) => {
      const [ticketSnap, messageSnap, eventSnap] = await Promise.all([transaction.get(ticketRef), transaction.get(messageRef), transaction.get(eventRef)]);
      if (!ticketSnap.exists) { ignored = true; return; }
      if (eventSnap.exists || messageSnap.exists) { ignored = true; return; }
      const current = ticketSnap.data() ?? {};
      if (current.userId !== account.uid || !mayReopenSupportTicket(current, Date.now())) { ignored = true; return; }
      const wasResolved = current.status === "resolved";
      transaction.create(messageRef, { id: messageId, authorType: "user", authorId: account.uid, body: text, createdAt: now, provider: "resend", providerMessageId });
      transaction.create(eventRef, { id: eventId, provider: "resend", ticketId: ticketRef.id, messageId, processedAt: now });
      transaction.set(ticketRef, { status: wasResolved ? "reopened" : "waiting_for_admin", reopenedAt: wasResolved ? now : current.reopenedAt ?? null, resolvedAt: wasResolved ? null : current.resolvedAt ?? null, reopenUntil: wasResolved ? null : current.reopenUntil ?? null, lastUserResponseAt: now, updatedAt: now }, { merge: true });
    });
    return Response.json({ accepted: !ignored, duplicateOrIneligible: ignored }, { status: 200 });
  } catch (error) { return serverError("Inbound support reply could not be processed.", error instanceof Error ? error.message : error); }
}
