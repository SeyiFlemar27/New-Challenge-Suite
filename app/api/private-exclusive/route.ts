import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

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
  const { response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Private exclusive challenges");

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;

  try {
    const snap = await db.collection("challenges").orderBy("createdAt", "desc").limit(limit * 3).get();
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
      .filter(isPrivateChallenge)
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

    const inviteSnap = await db.collection("privateChallengeInvites").where("code", "==", code).where("status", "==", "active").limit(1).get();
    if (inviteSnap.empty) {
      return fail("Invalid invite code. Request access or try again.", 404, { fieldErrors: { inviteCode: "Invite code was not found or is inactive." } }, "NOT_FOUND");
    }

    const inviteDoc = inviteSnap.docs[0];
    const invite = inviteDoc.data();
    const challengeId = String(invite.challengeId ?? "");
    if (!challengeId) {
      return fail("Invite code is not connected to a challenge.", 400, { fieldErrors: { inviteCode: "Invite configuration is incomplete." } }, "VALIDATION_ERROR");
    }

    const challengeSnap = await db.collection("challenges").doc(challengeId).get();
    if (!challengeSnap.exists || !isPrivateChallenge(challengeSnap.data() ?? {})) {
      return fail("Private challenge is unavailable.", 404, { fieldErrors: { challengeId: "Private challenge does not exist or is unavailable." } }, "NOT_FOUND");
    }

    await db.collection("privateChallengeAccess").doc(`${challengeId}_${user.uid}`).set({
      id: `${challengeId}_${user.uid}`,
      challengeId,
      userId: user.uid,
      inviteId: inviteDoc.id,
      status: "approved",
      source: "invite_code",
      createdAt: now,
      updatedAt: now
    }, { merge: true });

    return ok({ challengeId }, "Access granted. Private challenge unlocked.");
  }

  if (action === "request_access") {
    const ref = db.collection("privateChallengeAccessRequests").doc();
    await ref.set({
      id: ref.id,
      userId: user.uid,
      challengeId: parsed.body?.challengeId ?? null,
      status: "pending_review",
      createdAt: now,
      updatedAt: now
    });

    return ok({ requestId: ref.id, status: "pending_review" }, "Access request sent. Status: Pending Review.");
  }

  return validationError({ action: "Action must be check_code or request_access." });
}
