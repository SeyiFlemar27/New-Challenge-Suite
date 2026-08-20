import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { hashPrivateInviteCode, inviteExpired } from "@/lib/server/private-invites";
import { writeAuditLog } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function isPrivateChallenge(data: FirebaseFirestore.DocumentData) {
  const status = String(data.status ?? "").toLowerCase();
  const type = String(data.type ?? "").toLowerCase();
  const visibility = String(data.visibility ?? "").toLowerCase();
  return status !== "draft" && status !== "deleted" && status !== "removed" && (type === "private" || type === "private / exclusive" || visibility === "private" || visibility === "exclusive");
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Private exclusive challenges");

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;

  try {
    const [snap, accessSnap] = await Promise.all([
      db.collection("challenges").orderBy("createdAt", "desc").limit(limit * 4).get(),
      db.collection("privateChallengeAccess").where("userId", "==", user.uid).where("status", "==", "approved").limit(200).get()
    ]);
    const unlockedIds = new Set(accessSnap.docs.map((doc) => String(doc.data().challengeId ?? "")));
    const challenges = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
          startsAt: toIso(data.startsAt) ?? data.startsAt,
          endsAt: toIso(data.endsAt) ?? data.endsAt,
          registrationDeadline: toIso(data.registrationDeadline) ?? data.registrationDeadline
        };
      })
      .filter((challenge) => {
        const record = challenge as Record<string, unknown>;
        return isPrivateChallenge(record) && (record.creatorId === user.uid || record.hostId === user.uid || unlockedIds.has(String(record.id)));
      })
      .slice(0, limit);

    return ok({ challenges }, "Private exclusive challenges loaded.");
  } catch (error) {
    return serverError("Private exclusive challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Private exclusive access");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;

  const action = String(parsed.body?.action ?? "");
  const now = new Date().toISOString();

  if (action === "check_code") {
    const code = String(parsed.body?.inviteCode ?? "").trim().toUpperCase();
    if (!code) return validationError({ inviteCode: "Invite code is required." });

    const hashedInviteSnap = await db.collection("privateChallengeInvites").where("codeHash", "==", hashPrivateInviteCode(code)).where("status", "==", "active").limit(1).get();
    const inviteSnap = hashedInviteSnap.empty ? await db.collection("privateChallengeInvites").where("code", "==", code).where("status", "==", "active").limit(1).get() : hashedInviteSnap;
    if (inviteSnap.empty) {
      return fail("Invalid or expired invite code.", 404, { fieldErrors: { inviteCode: "Invite code was not found or is inactive." } }, "INVALID_INVITE_CODE");
    }

    const inviteDoc = inviteSnap.docs[0];
    const invite = inviteDoc.data();
    if (invite.enabled === false || inviteExpired(invite)) {
      return fail("Invite code has expired or is disabled.", 410, { fieldErrors: { inviteCode: "Invite code is no longer active." } }, "INVITE_INACTIVE");
    }
    const challengeId = String(invite.challengeId ?? "");
    if (!challengeId) {
      return fail("Invite code is not connected to a challenge.", 400, { fieldErrors: { inviteCode: "Invite configuration is incomplete." } }, "VALIDATION_ERROR");
    }
    const requestedChallengeId = String(parsed.body?.challengeId ?? "").trim();
    if (requestedChallengeId && requestedChallengeId !== challengeId) return fail("This access code does not match the selected private challenge.", 403, { fieldErrors: { inviteCode: "Use the access code shared for this challenge." } }, "INVITE_CHALLENGE_MISMATCH");

    const challengeSnap = await db.collection("challenges").doc(challengeId).get();
    if (!challengeSnap.exists || !isPrivateChallenge(challengeSnap.data() ?? {})) {
      return fail("Private challenge is unavailable.", 404, { fieldErrors: { challengeId: "Private challenge does not exist or is unavailable." } }, "NOT_FOUND");
    }

    let accessCreated = false;
    try {
    accessCreated = await db.runTransaction(async (transaction) => {
      const currentInviteSnap = await transaction.get(inviteDoc.ref);
      const accessRef = db.collection("privateChallengeAccess").doc(`${challengeId}_${user.uid}`);
      const currentAccessSnap = await transaction.get(accessRef);
      if (currentAccessSnap.exists && currentAccessSnap.data()?.status === "approved") return false;
      if (!currentInviteSnap.exists) throw new Error("INVITE_INACTIVE");
      const currentInvite = currentInviteSnap.data() ?? {};
      const transactionUses = Number(currentInvite.currentUses ?? 0);
      const transactionMaxUses = Number(currentInvite.maxUses ?? 0);
      if (currentInvite.enabled === false || currentInvite.status !== "active" || inviteExpired(currentInvite)) throw new Error("INVITE_INACTIVE");
      if (transactionMaxUses > 0 && transactionUses >= transactionMaxUses) throw new Error("INVITE_LIMIT_REACHED");
      transaction.set(accessRef, {
        id: `${challengeId}_${user.uid}`,
        challengeId,
        userId: user.uid,
        inviteId: inviteDoc.id,
        status: "approved",
        source: "invite_code",
        createdAt: now,
        updatedAt: now
      }, { merge: true });
      transaction.set(inviteDoc.ref, { currentUses: transactionUses + 1, lastUsedAt: now, updatedAt: now }, { merge: true });
      transaction.create(db.collection("privateInviteAuditEvents").doc(), {
        challengeId,
        inviteId: inviteDoc.id,
        userId: user.uid,
        action: "invite_code_used",
        createdAt: now
      });
      return true;
    });
    } catch (error) {
      const codeValue = error instanceof Error ? error.message : "INVITE_ACCESS_FAILED";
      if (codeValue === "INVITE_INACTIVE") return fail("Invite code has expired or is disabled.", 410, { fieldErrors: { inviteCode: "Invite code is no longer active." } }, codeValue);
      if (codeValue === "INVITE_LIMIT_REACHED") return fail("Invite code has reached its maximum uses.", 409, { fieldErrors: { inviteCode: "Invite code can no longer be used." } }, codeValue);
      return serverError("Private challenge access could not be verified.", codeValue);
    }
    if (accessCreated) await writeAuditLog({
      actorId: user.uid,
      actorType: "user",
      action: "private_invite.used",
      targetType: "challenge",
      targetId: challengeId,
      reason: "User unlocked private challenge with invite code.",
      metadata: { inviteId: inviteDoc.id }
    }, db).catch(() => undefined);

    return ok({ challengeId, challenge: { id: challengeSnap.id, title: challengeSnap.data()?.title ?? "Private challenge", status: challengeSnap.data()?.status ?? "active" } }, accessCreated ? "Access granted. Private challenge unlocked." : "Private challenge access is already active.");
  }

  if (action === "request_access") {
    const reason = String(parsed.body?.reason ?? "").trim();
    if (!reason) return validationError({ reason: "Reason for access is required." });
    const ref = db.collection("privateAccessRequests").doc();
    await ref.set({
      id: ref.id,
      userId: user.uid,
      challengeId: parsed.body?.challengeId ?? null,
      reason,
      note: parsed.body?.note ?? "",
      status: "pending_review",
      createdAt: now,
      updatedAt: now
    });

    return ok({ requestId: ref.id, status: "pending_review" }, "Access request sent.");
  }

  return validationError({ action: "Action must be check_code or request_access." });
}
