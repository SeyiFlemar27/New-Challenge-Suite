import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebase/admin";
import { sendEmail, type EmailMessage } from "@/lib/server/email";

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
type Delivery = { resolveRecipient(userId: string): Promise<string | null>; send(message: EmailMessage): Promise<void> };
/** Opt-in delivery through the existing provider; no customer email is sent by default. */
export async function deliverNormalEmailOutbox(db: Firestore, challengeId: string, adapter?: Delivery) {
  return deliverLifecycleEmailOutbox(db, challengeId, "normal", adapter);
}

export async function deliverTournamentEmailOutbox(db: Firestore, tournamentId: string, adapter?: Delivery) {
  return deliverLifecycleEmailOutbox(db, tournamentId, "tournament", adapter);
}

async function deliverLifecycleEmailOutbox(db: Firestore, challengeId: string, kind: "normal" | "tournament", adapter?: Delivery) {
  if (!adapter && process.env[kind === "normal" ? "NORMAL_EMAIL_DELIVERY_ENABLED" : "TOURNAMENT_EMAIL_DELIVERY_ENABLED"] !== "true") return { enabled: false, accepted: 0 };
  const provider = adapter ?? {
    async resolveRecipient(userId: string) {
      const auth = getAdminAuth();
      if (!auth) return null;
      const user = await auth.getUser(userId);
      return user.emailVerified && !user.disabled ? user.email ?? null : null;
    },
    send: sendEmail,
  };
  const messages = await db.collection(kind === "normal" ? "normalEmailOutbox" : "tournamentEmailOutbox").where(kind === "normal" ? "challengeId" : "tournamentId", "==", challengeId).get();
  let accepted = 0;
  for (const entry of messages.docs.filter(entry => !["accepted", "review_required"].includes(String(entry.data().status))).slice(0, 25)) {
    const token = randomUUID();
    const now = Date.now();
    const claim = await db.runTransaction(async transaction => {
      const latest = await transaction.get(entry.ref);
      const value = latest.data() ?? {};
      if (kind === "tournament") {
        const preferences = await transaction.get(db.collection("notificationPreferences").doc(String(value.userId)));
        if (preferences.data()?.email !== true || preferences.data()?.[String(value.category)] === false) { if (latest.exists) transaction.update(entry.ref, { status: "review_required", reason: "EMAIL_PERMISSION_UNAVAILABLE" }); return null; }
      }
      if (!latest.exists || ["accepted", "review_required"].includes(String(value.status)) || Date.parse(String(value.nextAttemptAt)) > now || (value.status === "sending" && Date.parse(String(value.leaseUntil)) > now)) return null;
      // Provider idempotency retention is finite. Never blindly resend an
      // uncertain old delivery once its original deduplication window elapsed.
      if (value.firstAttemptAt && now - Date.parse(String(value.firstAttemptAt)) >= 23 * 3600_000) {
        transaction.update(entry.ref, { status: "review_required", reason: "provider_acceptance_requires_reconciliation", updatedAt: new Date(now).toISOString() });
        return null;
      }
      transaction.update(entry.ref, { status: "sending", token, firstAttemptAt: value.firstAttemptAt ?? new Date(now).toISOString(), leaseUntil: new Date(now + 300_000).toISOString(), attempts: Number(value.attempts ?? 0) + 1 });
      return value;
    });
    if (!claim) continue;
    try {
      const recipient = await provider.resolveRecipient(String(claim.userId));
      if (!recipient) throw new Error("RECIPIENT_UNAVAILABLE");
      const title = String(claim.title).slice(0, 160), message = String(claim.message).slice(0, 2000);
      await provider.send({ to: recipient, subject: title, text: message, html: `<h2>${escape(title)}</h2><p>${escape(message)}</p>`, idempotencyKey: `${kind}-notice-${entry.id}` });
      await db.runTransaction(async transaction => {
        const latest = await transaction.get(entry.ref);
        if (latest.data()?.token === token) transaction.update(entry.ref, { status: "accepted", providerAcceptedAt: new Date().toISOString(), recipientDeliveryVerified: false, leaseUntil: null, updatedAt: new Date().toISOString() });
      });
      accepted++;
    } catch {
      await db.runTransaction(async transaction => {
        const latest = await transaction.get(entry.ref);
        if (latest.data()?.token === token) transaction.update(entry.ref, { status: "retry_pending", reason: "EMAIL_ACCEPTANCE_NOT_VERIFIED", nextAttemptAt: new Date(now + 300_000).toISOString(), leaseUntil: null });
      });
    }
  }
  return { enabled: true, accepted };
}
