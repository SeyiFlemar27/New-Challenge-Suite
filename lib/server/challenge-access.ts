import type { Firestore } from "firebase-admin/firestore";

export function isPrivateChallengeRecord(challenge: Record<string, unknown>) {
  const visibility = String(challenge.visibility ?? challenge.type ?? "public").toLowerCase();
  const type = String(challenge.type ?? "").toLowerCase();
  return visibility.includes("private")
    || visibility.includes("exclusive")
    || visibility.includes("invite")
    || type.includes("private")
    || type.includes("exclusive")
    || type.includes("invite");
}

export function userOwnsChallenge(challenge: Record<string, unknown>, userId: string) {
  return String(challenge.creatorId ?? challenge.hostId ?? "") === userId;
}

export async function hasChallengeAccessGrant(db: Firestore, challengeId: string, userId: string) {
  const accessSnap = await db.collection("privateChallengeAccess").doc(`${challengeId}_${userId}`).get();
  return accessSnap.exists && accessSnap.data()?.status === "approved";
}

export async function challengeForPlanAccess(db: Firestore, challenge: Record<string, unknown>, userId: string) {
  const privateOnly = isPrivateChallengeRecord(challenge);
  if (!privateOnly) return { challenge, privateOnly, isOwner: false, hasAccessGrant: false };

  const isOwner = userOwnsChallenge(challenge, userId);
  const hasAccessGrant = isOwner || await hasChallengeAccessGrant(db, String(challenge.id ?? ""), userId);
  return {
    challenge: hasAccessGrant ? { ...challenge, visibility: "public" } : challenge,
    privateOnly,
    isOwner,
    hasAccessGrant
  };
}
