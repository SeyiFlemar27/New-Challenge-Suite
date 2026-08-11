import type { Firestore } from "firebase-admin/firestore";
import { writeAuditLog } from "@/lib/server/audit";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 8) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return value;
}

export async function createPrivateChallengeInvite(db: Firestore, input: { challengeId: string; creatorId: string; now: string; code?: string; expiresAt?: string | null; maxUses?: number | null }) {
  let code = input.code && /^[A-HJ-NP-Z2-9]{5}$/.test(input.code) ? input.code : generateInviteCode(5);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.collection("privateChallengeInvites").where("code", "==", code).limit(1).get();
    if (existing.empty) break;
    code = generateInviteCode();
  }
  const ref = db.collection("privateChallengeInvites").doc();
  const invite = {
    id: ref.id,
    challengeId: input.challengeId,
    creatorId: input.creatorId,
    code,
    status: "active",
    enabled: true,
    maxUses: input.maxUses ?? 100,
    currentUses: 0,
    expiresAt: input.expiresAt ?? null,
    joinApprovalRequired: false,
    allowedEmails: [],
    allowedUserIds: [],
    createdAt: input.now,
    updatedAt: input.now,
    auditStatus: "created"
  };
  await ref.set(invite);
  await writeAuditLog({
    actorId: input.creatorId,
    actorType: "user",
    action: "private_invite.created",
    targetType: "private_invite",
    targetId: ref.id,
    after: { challengeId: input.challengeId, enabled: true, codeConfigured: true },
    reason: "Private challenge invite foundation created.",
    metadata: { moneyMovementEnabled: false }
  }, db).catch(() => undefined);
  return invite;
}

export async function hasPrivateChallengeAccess(db: Firestore, challengeId: string, userId: string) {
  const accessSnap = await db.collection("privateChallengeAccess").doc(`${challengeId}_${userId}`).get();
  if (accessSnap.exists && accessSnap.data()?.status === "approved") return true;
  return false;
}

export function inviteExpired(invite: Record<string, unknown>) {
  if (!invite.expiresAt) return false;
  const expiry = Date.parse(String(invite.expiresAt));
  return Number.isFinite(expiry) && Date.now() > expiry;
}
