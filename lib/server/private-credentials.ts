import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { generateInviteCode, generatePrivateInviteToken, hashPrivateInviteCode, hashPrivateInviteToken } from "@/lib/server/private-invites";

function encryptionKey() {
  const value = Buffer.from(process.env.PRIVATE_INVITE_ENCRYPTION_KEY ?? "", "base64");
  if (value.length !== 32) throw new Error("PRIVATE_CREDENTIAL_SERVICE_UNAVAILABLE");
  return value;
}
export function privateCredentialServiceReady() {
  try { encryptionKey(); return true; } catch { return false; }
}

/** The vault is server-only; public challenge records contain neither plaintext nor ciphertext. */
export function preparePrivateCredential(db: Firestore, challengeId: string, creatorId: string, method: string, now: string) {
  if (!["invite_link", "invitation_code"].includes(method)) throw new Error("ACCESS_METHOD_MISMATCH");
  const secret = method === "invitation_code" ? generateInviteCode(10) : generatePrivateInviteToken();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(challengeId));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  // A deterministic hash identity makes an extremely rare collision fail closed
  // at transaction.create, rather than binding the same code to two challenges.
  const identity = method === "invitation_code" ? `v2_code_${hashPrivateInviteCode(secret)}` : `v2_link_${hashPrivateInviteToken(secret)}`;
  const ref = db.collection("privateChallengeInvites").doc(identity);
  const invite = { id: ref.id, challengeId, creatorId, accessMethod: method, policyVersion: 2, status: "active", enabled: true,
    // Publication and enrollment are checked against the challenge in every redemption transaction.
    activation: "requires_published_challenge", maxUses: 0, currentUses: 0, expiresAt: null,
    ...(method === "invitation_code" ? { codeHash: hashPrivateInviteCode(secret) } : { tokenHash: hashPrivateInviteToken(secret) }), createdAt: now, updatedAt: now };
  const vault = { challengeId, inviteId: ref.id, method, ciphertext: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), updatedAt: now };
  return {
    inviteId: ref.id,
    apply(transaction: Transaction) {
      transaction.create(ref, invite);
      transaction.set(db.collection("privateCredentialVault").doc(challengeId), vault);
      transaction.create(db.collection("privateInviteAuditEvents").doc(`created_${ref.id}`), { challengeId, inviteId: ref.id, actorId: creatorId, action: "credential_prepared", accessMethod: method, createdAt: now });
    }
  };
}

export async function readPrivateCredential(db: Firestore, challengeId: string) {
  const snapshot = await db.collection("privateCredentialVault").doc(challengeId).get();
  const data = snapshot.data();
  if (!data) throw new Error("PRIVATE_CREDENTIAL_SERVICE_UNAVAILABLE");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(data.iv, "base64"));
  decipher.setAAD(Buffer.from(challengeId));
  decipher.setAuthTag(Buffer.from(data.tag, "base64"));
  return { method: String(data.method), inviteId: String(data.inviteId), credential: Buffer.concat([decipher.update(Buffer.from(data.ciphertext, "base64")), decipher.final()]).toString("utf8") };
}
