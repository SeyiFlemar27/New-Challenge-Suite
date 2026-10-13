import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { sendEmail } from "@/lib/server/email";
import { supportTicketReplyAddress } from "@/lib/server/support-tickets";

export function supportEmailDeliveryEnabled() {
  return process.env.SUPPORT_EMAIL_DELIVERY_ENABLED === "true";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function supportEmailContent(ticketNumber: string, title: string, message: string) {
  const safeTitle = title.trim().slice(0, 180);
  const safeMessage = message.trim().slice(0, 10_000);
  const replyTo = supportTicketReplyAddress(ticketNumber);
  return {
    subject: `${safeTitle} (${ticketNumber})`,
    text: `${safeTitle}\n\n${safeMessage}\n\nSupport reference: ${ticketNumber}`,
    html: `<h2>${escapeHtml(safeTitle)}</h2><p>${escapeHtml(safeMessage).replaceAll("\n", "<br>")}</p><p>Support reference: <strong>${escapeHtml(ticketNumber)}</strong></p>`,
    replyTo
  };
}

export async function dispatchSupportEmailOutbox(db: Firestore, outboxId: string) {
  if (!supportEmailDeliveryEnabled()) return { status: "waiting_configuration" as const };
  const ref = db.collection("supportEmailOutbox").doc(outboxId);
  const claimToken = randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  let message: { to: string; subject: string; text: string; html: string; replyTo?: string } | null = null;
  let skip: "sent" | "claimed" | "unavailable" | null = null;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) { skip = "unavailable"; return; }
    const data = snapshot.data() ?? {};
    if (data.status === "sent") { skip = "sent"; return; }
    const claimAt = Date.parse(String(data.claimedAt ?? ""));
    if (data.status === "sending" && Number.isFinite(claimAt) && now.getTime() - claimAt < 5 * 60_000) { skip = "claimed"; return; }
    const recipient = typeof data.recipient === "string" ? data.recipient.trim() : "";
    const subject = typeof data.subject === "string" ? data.subject : "";
    const text = typeof data.text === "string" ? data.text : "";
    const html = typeof data.html === "string" ? data.html : "";
    if (!recipient || !subject || (!text && !html)) { skip = "unavailable"; transaction.set(ref, { status: "blocked", lastError: "email_payload_unavailable", updatedAt: nowIso }, { merge: true }); return; }
    message = { to: recipient, subject, text, html, ...(typeof data.replyTo === "string" && data.replyTo ? { replyTo: data.replyTo } : {}) };
    transaction.set(ref, { status: "sending", claimToken, claimedAt: nowIso, attempts: Number(data.attempts ?? 0) + 1, updatedAt: nowIso, lastError: null }, { merge: true });
  });
  if (skip) return { status: skip === "sent" ? "sent" as const : skip === "claimed" ? "pending" as const : "blocked" as const };
  try {
    await sendEmail({ ...message!, idempotencyKey: `support-outbox-${outboxId}` });
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists && snapshot.data()?.claimToken === claimToken) transaction.set(ref, { status: "sent", sentAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastError: null }, { merge: true });
    });
    return { status: "sent" as const };
  } catch (error) {
    const reason = typeof (error as { reason?: unknown })?.reason === "string" ? String((error as { reason: string }).reason) : error instanceof Error ? error.name : "delivery_failed";
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists && snapshot.data()?.claimToken === claimToken) transaction.set(ref, { status: "failed", lastError: reason, updatedAt: new Date().toISOString() }, { merge: true });
    });
    return { status: "failed" as const, reason };
  }
}
