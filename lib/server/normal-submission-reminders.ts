import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { normalTimestamp } from "@/lib/server/normal-lifecycle-policy";
import { isEnteredParticipantStatus } from "@/lib/server/submission-lifecycle";
import { isPrivateChallengeRecord } from "@/lib/server/challenge-access";
export async function queueNormalCorrectionReminder(db: Firestore, challengeId: string, submissionId: string, now = new Date()) {
  const latest = await db.collection("submissions").doc(submissionId).get(), entry = latest.data() ?? {};
  const deadline = normalTimestamp(entry.resubmissionDeadline), remaining = deadline - now.getTime();
  if (!latest.exists || entry.challengeId !== challengeId || !["resubmission_requested", "correction_requested"].includes(String(entry.status)) || typeof entry.userId !== "string" || !entry.userId || entry.userId.includes("/") || !Number.isFinite(remaining) || remaining <= 0 || remaining > 6 * 3600000) return;
  const hours = remaining <= 3600000 ? 1 : 6, deadlineAt = new Date(deadline).toISOString();
  const id = deterministicId("normal_correction_reminder", challengeId, submissionId, deadlineAt, hours);
  try { await db.collection("normalNotificationOutbox").doc(id).create({ challengeId, submissionId, recipientUserId: entry.userId, type: "normal_submission_reminder", reminderDeadlineAt: deadlineAt, reminderHours: hours, title: "Your entry needs a correction", message: "Your personal correction window is closing. Review the requested changes and current deadline.", status: "pending", createdAt: now.toISOString() }); }
  catch (error) { if ((error as { code?: number })?.code !== 6) throw error; }
}
export async function queueNormalSubmissionReminders(db: Firestore, challengeId: string, now = new Date()) {
  const snapshot = await db.collection("challenges").doc(challengeId).get(), challenge = snapshot.data() ?? {};
  const deadline = normalTimestamp(challenge.submissionDeadline), remaining = deadline - now.getTime();
  if (!snapshot.exists || challenge.builderVersion !== "normal_v3" || !["submission_open", "registration_open", "active"].includes(String(challenge.status)) || normalTimestamp(challenge.submissionStartAt ?? challenge.startsAt) > now.getTime() || !Number.isFinite(remaining) || remaining <= 0 || remaining > 6 * 3600000) return { queued: false };
  const hours = remaining <= 3600000 ? 1 : 6, deadlineAt = new Date(deadline).toISOString();
  const id = deterministicId("normal_submission_reminder", challengeId, deadlineAt, hours);
  try { await db.collection("normalNotificationOutbox").doc(id).create({ challengeId, type: "normal_submission_reminder", reminderDeadlineAt: deadlineAt, reminderHours: hours, title: `${hours}-hour submission reminder`, message: "Your challenge still needs a valid entry. Review the current deadline and entry requirements.", status: "pending", cursor: null, createdAt: now.toISOString() }); }
  catch (error) { if ((error as { code?: number })?.code !== 6) throw error; }
  return { queued: true };
}

/** Bounded recipient fanout; every recipient and deadline is revalidated before
 * creating the inbox item. No queued event is itself proof of delivery. */
export async function deliverNormalReminderBatch(db: Firestore, eventId: string, now = new Date()) {
  return db.runTransaction(async tx => {
    const ref = db.collection("normalNotificationOutbox").doc(eventId), source = await tx.get(ref), event = source.data() ?? {};
    if (!source.exists || event.status !== "pending") return 0;
    const challengeId = String(event.challengeId), challengeRef = db.collection("challenges").doc(challengeId), snapshot = await tx.get(challengeRef), challenge = snapshot.data() ?? {};
    const personal = typeof event.recipientUserId === "string" && typeof event.submissionId === "string";
    const correction = personal ? await tx.get(db.collection("submissions").doc(String(event.submissionId))) : null;
    const latestDeadline = personal ? correction?.data()?.resubmissionDeadline : challenge.submissionDeadline;
    const validState = personal ? !["draft", "cancelled", "canceled", "paused", "completed", "winners_announced"].includes(String(challenge.status)) && correction?.data()?.userId === event.recipientUserId && correction?.data()?.challengeId === challengeId && ["resubmission_requested", "correction_requested"].includes(String(correction?.data()?.status)) : ["submission_open", "registration_open", "active"].includes(String(challenge.status));
    if (!snapshot.exists || !validState || !Number.isFinite(normalTimestamp(latestDeadline)) || new Date(normalTimestamp(latestDeadline)).toISOString() !== event.reminderDeadlineAt || normalTimestamp(latestDeadline) <= now.getTime()) { tx.update(ref, { status: "completed", outcome: "stale_deadline_or_state", updatedAt: now.toISOString() }); return 0; }
    let query = db.collection("challengeParticipants").where("challengeId", "==", challengeId).orderBy(FieldPath.documentId()).limit(25);
    if (personal) query = query.where("userId", "==", event.recipientUserId);
    if (typeof event.cursor === "string") query = query.startAfter(event.cursor);
    const page = await tx.get(query), candidates = page.docs.filter(row => isEnteredParticipantStatus(row.data().status) && typeof row.data().userId === "string" && row.data().userId && !row.data().userId.includes("/") && (!row.data().paidEntryEnabled || ["paid", "confirmed"].includes(String(row.data().entryPaymentStatus))));
    const deliveries: Array<{ id: string; userId: string }> = [];
    for (const participant of candidates) {
      const userId = String(participant.data().userId), account = await tx.get(db.collection("users").doc(userId));
      if (!account.exists || account.data()?.disabled === true || account.data()?.suspended === true || ["disabled", "suspended", "deleted", "deactivated"].includes(String(account.data()?.accountStatus))) continue;
      if (isPrivateChallengeRecord(challenge)) { const access = await tx.get(db.collection("privateChallengeAccess").doc(`${challengeId}_${userId}`)); if (access.data()?.status !== "approved") continue; }
      const pointer = participant.data().submissionId ?? participant.data().lastSubmissionId;
      if (personal && pointer && pointer !== event.submissionId) continue;
      let entry: Record<string, unknown> | undefined;
      if (typeof pointer === "string" && pointer && !pointer.includes("/")) { const stored = await tx.get(db.collection("submissions").doc(pointer)); if (stored.data()?.challengeId !== challengeId || stored.data()?.userId !== userId) continue; entry = stored.data(); }
      else { const legacy = await tx.get(db.collection("submissions").where("challengeId", "==", challengeId).where("userId", "==", userId).limit(2)); if (legacy.size > 1) continue; entry = legacy.docs[0]?.data(); }
      if (entry && ["submitted", "pending_review", "pending_moderation", "under_review", "approved", "active"].includes(String(entry.status)) && entry.mediaUploadPending !== true) continue;
      if (entry && !["resubmission_requested", "correction_requested"].includes(String(entry.status)) && entry.mediaUploadPending !== true) continue;
      if (entry?.resubmissionDeadline && normalTimestamp(entry.resubmissionDeadline) <= now.getTime()) continue;
      const id = deterministicId("normal_notice", eventId, userId), existing = await tx.get(db.collection("notifications").doc(id));
      if (!existing.exists) deliveries.push({ id, userId });
    }
    for (const { id, userId } of deliveries) tx.create(db.collection("notifications").doc(id), { id, userId, type: "normal_submission_reminder", essential: true, category: "participation", title: event.title, message: event.message, body: event.message, read: false, status: "unread", actionUrl: `/challenges/${encodeURIComponent(challengeId)}`, entityType: "challenge", entityId: challengeId, createdAt: now.toISOString(), delivery: { inApp: true, email: false, push: false } });
    tx.update(ref, { cursor: page.docs.at(-1)?.id ?? event.cursor ?? null, status: page.size < 25 ? "completed" : "pending", updatedAt: now.toISOString() });
    return deliveries.length;
  });
}
