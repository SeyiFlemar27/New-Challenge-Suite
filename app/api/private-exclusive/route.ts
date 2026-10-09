import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { conflict, fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import {
  admitPrivateChallenge,
  createPrivateChallengeInvite,
  hashPrivateInviteCode,
  hashPrivateInviteToken,
  inviteExpired,
  privateRequirements,
  revokePrivateChallengeInvite,
  validatePrivateParticipantEligibility,
  validatePrivateRequirementEvidence
} from "@/lib/server/private-invites";
import { isPrivateChallengeRecord, userOwnsChallenge } from "@/lib/server/challenge-access";
import { isChallengeJoinable } from "@/lib/server/submission-lifecycle";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}

function inviteError(error: unknown) {
  const code = error instanceof Error ? error.message : "PRIVATE_ACCESS_FAILED";
  const responses: Record<string, { status: number; message: string }> = {
    INVITE_NOT_FOUND: { status: 404, message: "This private invitation was not found." },
    INVITE_CHALLENGE_MISMATCH: { status: 403, message: "This invitation does not match the selected challenge." },
    ACCESS_METHOD_MISMATCH: { status: 403, message: "This invitation does not match the challenge access method." },
    INVITE_INACTIVE: { status: 410, message: "This invitation has expired or was revoked." },
    INVITE_LIMIT_REACHED: { status: 409, message: "This invitation has reached its use limit." },
    INVITE_RECIPIENT_MISMATCH: { status: 403, message: "This direct invitation belongs to a different verified email address." },
    INVITE_ALREADY_CLAIMED: { status: 409, message: "This direct invitation has already been accepted." },
    SELF_ADMISSION_FORBIDDEN: { status: 403, message: "Challenge owners cannot admit themselves as participants." },
    CHALLENGE_UNAVAILABLE: { status: 404, message: "Private challenge is unavailable." },
    CHALLENGE_NOT_JOINABLE: { status: 409, message: "This challenge is not currently accepting participants." },
    ACCOUNT_UNAVAILABLE: { status: 403, message: "This account cannot join challenges." },
    COUNTRY_NOT_ELIGIBLE: { status: 403, message: "Your verified account location is not eligible for this challenge." },
    COUNTRY_VERIFICATION_REQUIRED: { status: 403, message: "Verified account location is required for this challenge." },
    AGE_VERIFICATION_REQUIRED: { status: 403, message: "Verified age information is required for this challenge." },
    AGE_NOT_ELIGIBLE: { status: 403, message: "Your verified age does not meet this challenge's minimum age." },
    PARTICIPANT_REQUIREMENTS_REQUIRED: { status: 422, message: "Accept every participant requirement before continuing." },
    PARTICIPANT_ANSWERS_REQUIRED: { status: 422, message: "Answer each required participant question before continuing." },
    CHALLENGE_FULL: { status: 409, message: "This challenge is full and does not accept a waitlist admission." },
    PARTICIPATION_NOT_ELIGIBLE: { status: 403, message: "Your existing participation status does not allow admission." },
    DIRECT_INVITEE_EMAILS_REQUIRED: { status: 422, message: "Add valid recipient email addresses for direct invitations." },
    PERMISSION_DENIED: { status: 403, message: "Only this challenge's owner can revoke its invitations." }
  };
  const resolved = responses[code];
  return resolved ? fail(resolved.message, resolved.status, undefined, code) : serverError("Private challenge access could not be completed.", code);
}

async function findInvite(db: FirebaseFirestore.Firestore, credential: string) {
  const tokenSnap = await db.collection("privateChallengeInvites").where("tokenHash", "==", hashPrivateInviteToken(credential)).limit(1).get();
  if (!tokenSnap.empty) return tokenSnap.docs[0];
  const codeSnap = await db.collection("privateChallengeInvites").where("codeHash", "==", hashPrivateInviteCode(credential)).limit(1).get();
  return codeSnap.empty ? null : codeSnap.docs[0];
}

async function consumePrivateAdmissionAttempt(db: FirebaseFirestore.Firestore, uid: string) {
  const ref = db.collection("privateInviteRateLimits").doc(uid);
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() ?? {};
    const resetAt = Number(data.resetAt ?? 0);
    const count = resetAt > now ? Number(data.count ?? 0) : 0;
    if (count >= 10) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
    transaction.set(ref, { uid, count: count + 1, resetAt: resetAt > now ? resetAt : now + 60_000, updatedAt: new Date(now).toISOString() });
    return { allowed: true, retryAfterSeconds: 0 };
  });
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Private exclusive challenges");
  const url = new URL(request.url);
  const challengeId = String(url.searchParams.get("challengeId") ?? "").trim();
  if (challengeId) {
    const challengeSnap = await db.collection("challenges").doc(challengeId).get();
    if (!challengeSnap.exists || !userOwnsChallenge({ id: challengeId, ...challengeSnap.data() }, user.uid)) return fail("Private challenge not found.", 404, undefined, "NOT_FOUND");
    const [inviteSnap, requestSnap] = await Promise.all([
      db.collection("privateChallengeInvites").where("challengeId", "==", challengeId).limit(200).get(),
      db.collection("privateAccessRequests").where("challengeId", "==", challengeId).orderBy("createdAt", "desc").limit(100).get()
    ]);
    const accessRequests = await Promise.all(requestSnap.docs.map(async (doc) => {
      const requestData = doc.data();
      const requesterId = String(requestData.userId ?? "");
      const [profileSnap, accountSnap] = await Promise.all([
        db.collection("profiles").doc(requesterId).get(),
        db.collection("users").doc(requesterId).get()
      ]);
      const profile = { ...(accountSnap.data() ?? {}), ...(profileSnap.data() ?? {}) };
      const privateProfile = String(profile.profileVisibility ?? "public") === "private";
      return {
        id: doc.id,
        challengeId,
        userId: requesterId,
        displayName: privateProfile ? "Private profile" : String(profile.displayName ?? profile.name ?? "Challenge Suite member"),
        username: privateProfile ? null : typeof profile.username === "string" ? profile.username : null,
        reason: String(requestData.reason ?? ""),
        note: String(requestData.note ?? ""),
        status: String(requestData.status ?? "pending_review"),
        createdAt: toIso(requestData.createdAt),
        updatedAt: toIso(requestData.updatedAt),
        decidedAt: toIso(requestData.decidedAt),
        decidedBy: requestData.decidedBy ?? null
      };
    }));
    return ok({ invitations: inviteSnap.docs.map((doc) => {
      const invite = doc.data();
      return { id: doc.id, accessMethod: invite.accessMethod, status: invite.status, enabled: invite.enabled !== false, recipientEmail: invite.recipientEmail ?? null, tokenLastFour: invite.tokenLastFour ?? null, codeLastTwo: invite.codeLastTwo ?? null, currentUses: invite.currentUses ?? 0, maxUses: invite.maxUses ?? null, expiresAt: toIso(invite.expiresAt), createdAt: toIso(invite.createdAt), acceptedAt: toIso(invite.acceptedAt), revokedAt: toIso(invite.revokedAt) };
    }), accessRequests }, "Private invitations and access requests loaded.");
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;
  try {
    const [snap, accessSnap, previewSnap, requestSnap] = await Promise.all([
      db.collection("challenges").orderBy("createdAt", "desc").limit(limit * 4).get(),
      db.collection("privateChallengeAccess").where("userId", "==", user.uid).where("status", "==", "approved").limit(200).get(),
      db.collection("challenges").where("publicPreviewEnabled", "==", true).orderBy("createdAt", "desc").limit(limit * 4).get(),
      db.collection("privateAccessRequests").where("userId", "==", user.uid).limit(200).get()
    ]);
    const unlockedIds = new Set(accessSnap.docs.map((doc) => String(doc.data().challengeId ?? "")));
    const requestByChallenge = new Map(requestSnap.docs.map((doc) => [String(doc.data().challengeId ?? ""), { id: doc.id, status: String(doc.data().status ?? "pending_review"), reason: String(doc.data().reason ?? ""), decidedAt: toIso(doc.data().decidedAt) }]));
    const ownedOrUnlocked = snap.docs.map((doc) => {
      const data = doc.data();
      return { ...data, id: doc.id, privateDirectInvitees: undefined, privateAccessCode: undefined, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt), startsAt: toIso(data.startsAt) ?? data.startsAt, endsAt: toIso(data.endsAt) ?? data.endsAt, registrationDeadline: toIso(data.registrationDeadline) ?? data.registrationDeadline, accessRequest: requestByChallenge.get(doc.id) ?? null };
    }).filter((challenge) => {
      const record = challenge as Record<string, unknown>;
      const status = String(record.status ?? "").toLowerCase();
      return isPrivateChallengeRecord(record) && !["draft", "deleted", "removed"].includes(status) && (record.creatorId === user.uid || record.hostId === user.uid || unlockedIds.has(String(record.id)));
    });
    const previewChallenges = previewSnap.docs.flatMap((doc) => {
      const data = doc.data();
      const record = { id: doc.id, ...data } as Record<string, unknown>;
      const status = String(record.status ?? record.lifecycleStatus ?? "").toLowerCase();
      if (!isPrivateChallengeRecord(record) || ["draft", "deleted", "removed", "cancelled"].includes(status) || record.creatorId === user.uid || record.hostId === user.uid || unlockedIds.has(doc.id)) return [];
      const publicPreview = {
        id: doc.id,
        privatePreview: true,
        title: String(record.title ?? "Private challenge"),
        shortDescription: String(record.shortDescription ?? record.description ?? ""),
        category: String(record.category ?? ""),
        status,
        startsAt: toIso(record.startsAt),
        privateParticipantRequirements: Array.isArray(record.privateParticipantRequirements) ? record.privateParticipantRequirements.map(String) : [],
        privateParticipantAcknowledgements: Array.isArray(record.privateParticipantAcknowledgements) ? record.privateParticipantAcknowledgements.map(String) : [],
        privateParticipantQuestions: Array.isArray(record.privateParticipantQuestions) ? record.privateParticipantQuestions.map(String) : [],
        accessRequest: requestByChallenge.get(doc.id) ?? null
      };
      return [publicPreview];
    });
    const challenges = [...ownedOrUnlocked, ...previewChallenges].slice(0, limit);
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
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const now = new Date().toISOString();

  if (action === "preview_invite" || action === "admit_invite" || action === "check_code") {
    const credential = String(body.credential ?? body.inviteCode ?? body.token ?? "").trim();
    if (!credential || credential.length > 300) return validationError({ credential: "A valid invitation credential is required." });
    const rateLimit = await consumePrivateAdmissionAttempt(db, user.uid);
    if (!rateLimit.allowed) return fail("Too many private access attempts. Please wait before trying again.", 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, "RATE_LIMITED");
    try {
      const inviteDoc = await findInvite(db, credential);
      if (!inviteDoc) throw new Error("INVITE_NOT_FOUND");
      const invite = inviteDoc.data();
      const challengeId = String(invite.challengeId ?? "");
      if (body.challengeId && String(body.challengeId) !== challengeId) throw new Error("INVITE_CHALLENGE_MISMATCH");
      const challengeSnap = await db.collection("challenges").doc(challengeId).get();
      if (!challengeSnap.exists || !isPrivateChallengeRecord(challengeSnap.data() ?? {})) throw new Error("CHALLENGE_UNAVAILABLE");
      const challenge = { id: challengeId, ...challengeSnap.data() } as Record<string, unknown>;
      if (String(challenge.privateAccessMethod ?? "") !== String(invite.accessMethod ?? "")) throw new Error("ACCESS_METHOD_MISMATCH");
      const accessSnap = await db.collection("privateChallengeAccess").doc(`${challengeId}_${user.uid}`).get();
      const alreadyAdmitted = accessSnap.exists && accessSnap.data()?.status === "approved";
      const requirements = privateRequirements(challenge);
      if (alreadyAdmitted) {
        if (action === "preview_invite") return ok({ challengeId, accessMethod: invite.accessMethod, alreadyAdmitted: true, challenge: { id: challengeId, title: challenge.title ?? "Private challenge" }, requirements }, "Access is already active for your account.");
        return ok({ challengeId, alreadyAdmitted: true }, "Private challenge access is already active.");
      }
      if (invite.enabled === false || !["active", "pending"].includes(String(invite.status)) || inviteExpired(invite)) throw new Error("INVITE_INACTIVE");
      if (!isChallengeJoinable(challenge).allowed) throw new Error("CHALLENGE_NOT_JOINABLE");
      if (String(invite.accessMethod) === "direct_invitations" && String(invite.recipientEmail ?? "").toLowerCase() !== String(user.email ?? "").toLowerCase()) throw new Error("INVITE_RECIPIENT_MISMATCH");
      const [accountSnap, profileSnap] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("profiles").doc(user.uid).get()]);
      const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
      const eligibility = validatePrivateParticipantEligibility(challenge, profile);
      if (eligibility) throw new Error(eligibility);
      if (action === "preview_invite") return ok({ challengeId, accessMethod: invite.accessMethod, alreadyAdmitted: false, challenge: { id: challengeId, title: challenge.title ?? "Private challenge" }, requirements }, "Invitation is valid. Review and accept the participant requirements to continue.");
      const admitted = await admitPrivateChallenge(db, {
        challengeId,
        userId: user.uid,
        verifiedEmail: String(user.email ?? ""),
        method: String(invite.accessMethod) as "invite_link" | "invitation_code" | "direct_invitations",
        credential,
        requirementAcknowledgements: body.requirementAcknowledgements,
        participantAnswers: body.participantAnswers,
        now
      });
      return ok(admitted, admitted.alreadyAdmitted ? "Private challenge access is already active." : "Access granted. Private challenge unlocked.");
    } catch (error) {
      return inviteError(error);
    }
  }

  if (action === "revoke_invite") {
    const challengeId = String(body.challengeId ?? "").trim();
    const inviteId = String(body.inviteId ?? "").trim();
    if (!challengeId || !inviteId) return validationError({ inviteId: "Challenge and invitation IDs are required." });
    try {
      await revokePrivateChallengeInvite(db, { challengeId, inviteId, actorId: user.uid, now });
      return ok({ challengeId, inviteId, status: "revoked" }, "Private invitation revoked.");
    } catch (error) {
      return inviteError(error);
    }
  }

  if (action === "rotate_invites") {
    const challengeId = String(body.challengeId ?? "").trim();
    const challengeSnap = challengeId ? await db.collection("challenges").doc(challengeId).get() : null;
    if (!challengeSnap?.exists || !userOwnsChallenge({ id: challengeId, ...(challengeSnap.data() ?? {}) }, user.uid)) return fail("Private challenge not found.", 404, undefined, "NOT_FOUND");
    const challenge = challengeSnap.data() ?? {};
    const method = String(challenge.privateAccessMethod ?? "") as "invite_link" | "invitation_code" | "direct_invitations";
    if (!["invite_link", "invitation_code", "direct_invitations"].includes(method)) return validationError({ challengeId: "Challenge access method is not configured." });
    const existing = await db.collection("privateChallengeInvites").where("challengeId", "==", challengeId).limit(500).get();
    const recipientEmails = method === "direct_invitations" ? [...new Set(existing.docs.map((doc) => String(doc.data().recipientEmail ?? "").trim().toLowerCase()).filter(Boolean))] : [];
    await db.runTransaction(async (transaction) => {
      for (const doc of existing.docs) transaction.set(doc.ref, { status: "revoked", enabled: false, revokedAt: now, revokedBy: user.uid, updatedAt: now }, { merge: true });
    });
    try {
      const privateAccess = await createPrivateChallengeInvite(db, { challengeId, creatorId: user.uid, now, method, maxUses: method === "direct_invitations" ? 1 : Number(challenge.privateAccessCodeMaxUses ?? 100), expiresAt: typeof challenge.privateAccessCodeExpiresAt === "string" ? challenge.privateAccessCodeExpiresAt : null, allowedEmails: recipientEmails });
      return ok({ privateAccess }, "Private invitation credentials rotated. Share the new credential securely.");
    } catch (error) {
      return inviteError(error);
    }
  }

  if (action === "request_access") {
    const reason = String(body.reason ?? "").trim().slice(0, 1000);
    const challengeId = String(body.challengeId ?? "").trim();
    if (!reason || !challengeId) return validationError({ reason: "Reason and challenge are required." });
    const challengeRef = db.collection("challenges").doc(challengeId);
    const ref = db.collection("privateAccessRequests").doc(`${challengeId}_${user.uid}`);
    try {
      const result = await db.runTransaction(async (transaction) => {
        const [challengeSnap, requestSnap, accessSnap, accountSnap, profileSnap] = await Promise.all([
          transaction.get(challengeRef), transaction.get(ref), transaction.get(db.collection("privateChallengeAccess").doc(`${challengeId}_${user.uid}`)),
          transaction.get(db.collection("users").doc(user.uid)), transaction.get(db.collection("profiles").doc(user.uid))
        ]);
        if (!challengeSnap.exists) throw new Error("CHALLENGE_UNAVAILABLE");
        const challenge = { id: challengeId, ...challengeSnap.data() } as Record<string, unknown>;
        if (!isPrivateChallengeRecord(challenge) || challenge.publicPreviewEnabled !== true || !["published", "approved", "scheduled", "registration_open", "active"].includes(String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase()) || !isChallengeJoinable(challenge).allowed) throw new Error("CHALLENGE_UNAVAILABLE");
        if (userOwnsChallenge(challenge, user.uid)) throw new Error("OWNER_REQUEST_FORBIDDEN");
        if (accessSnap.exists && accessSnap.data()?.status === "approved") return { requestId: ref.id, status: "approved", duplicate: true };
        if (requestSnap.exists && requestSnap.data()?.status === "pending_review") return { requestId: ref.id, status: "pending_review", duplicate: true };
        if (requestSnap.exists && requestSnap.data()?.status === "rejected") throw new Error("REQUEST_ALREADY_REJECTED");
        const profile = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) };
        const eligibilityError = validatePrivateParticipantEligibility(challenge, profile);
        if (eligibilityError) throw new Error(eligibilityError);
        const evidence = validatePrivateRequirementEvidence(challenge, body);
        if (typeof evidence === "string") throw new Error(evidence);
        transaction.set(ref, {
          id: ref.id, userId: user.uid, challengeId, ownerId: String(challenge.creatorId ?? challenge.hostId ?? ""),
          reason, note: String(body.note ?? "").trim().slice(0, 1000), status: "pending_review",
          requirementAcknowledgements: evidence.requiredIds, participantAnswers: evidence.answers,
          requirementsAcceptedAt: now, createdAt: now, updatedAt: now, decidedBy: null, decidedAt: null
        });
        return { requestId: ref.id, status: "pending_review", duplicate: false };
      });
      return ok(result, result.status === "approved" ? "Access is already approved." : result.duplicate ? "Your access request is already pending." : "Access request sent to the challenge owner.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "CHALLENGE_UNAVAILABLE") return fail("This private challenge is not accepting access requests.", 409, undefined, code);
      if (code === "OWNER_REQUEST_FORBIDDEN") return fail("Challenge owners do not need to request access.", 403, undefined, code);
      if (code === "REQUEST_ALREADY_REJECTED") return fail("This access request was rejected and cannot be resubmitted.", 409, undefined, code);
      if (code === "PARTICIPANT_REQUIREMENTS_REQUIRED" || code === "PARTICIPANT_ANSWERS_REQUIRED") return fail("Complete the participant requirements before requesting access.", 422, undefined, code);
      if (["ACCOUNT_UNAVAILABLE", "COUNTRY_NOT_ELIGIBLE", "COUNTRY_VERIFICATION_REQUIRED", "AGE_VERIFICATION_REQUIRED", "AGE_NOT_ELIGIBLE"].includes(code)) return fail("Your account is not eligible to request access to this challenge.", 403, undefined, code);
      return serverError("Private challenge access request could not be saved.", code);
    }
  }

  if (action === "decide_access_request") {
    const challengeId = String(body.challengeId ?? "").trim();
    const requestId = String(body.requestId ?? "").trim();
    const decision = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "";
    if (!challengeId || !requestId || !decision) return validationError({ decision: "Challenge, request, and a valid decision are required." });
    const challengeRef = db.collection("challenges").doc(challengeId);
    const requestRef = db.collection("privateAccessRequests").doc(requestId);
    const accessRef = db.collection("privateChallengeAccess").doc(`${challengeId}_${requestId.slice(challengeId.length + 1)}`);
    try {
      const result = await db.runTransaction(async (transaction) => {
        const [challengeSnap, requestSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(requestRef)]);
        if (!challengeSnap.exists || !userOwnsChallenge({ id: challengeId, ...challengeSnap.data() }, user.uid)) throw new Error("OWNER_MISMATCH");
        if (!requestSnap.exists || requestSnap.data()?.challengeId !== challengeId || requestSnap.data()?.ownerId !== user.uid || requestSnap.id !== `${challengeId}_${String(requestSnap.data()?.userId ?? "")}`) throw new Error("REQUEST_NOT_FOUND");
        const requestData = requestSnap.data() ?? {};
        const priorStatus = String(requestData.status ?? "");
        if (priorStatus === decision) return { requestId, status: decision, duplicate: true };
        if (priorStatus !== "pending_review") throw new Error("REQUEST_ALREADY_DECIDED");
        const challenge = { id: challengeId, ...challengeSnap.data() } as Record<string, unknown>;
        if (decision === "approved") {
          const userId = String(requestData.userId ?? "");
          const [accountSnap, profileSnap, existingAccess] = await Promise.all([
            transaction.get(db.collection("users").doc(userId)), transaction.get(db.collection("profiles").doc(userId)), transaction.get(accessRef)
          ]);
          if (existingAccess.exists && existingAccess.data()?.status === "approved") throw new Error("ACCESS_ALREADY_GRANTED");
          const eligibilityError = validatePrivateParticipantEligibility(challenge, { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) });
          if (eligibilityError) throw new Error(eligibilityError);
          const evidence = validatePrivateRequirementEvidence(challenge, {
            requirementAcknowledgements: requestData.requirementAcknowledgements,
            participantAnswers: requestData.participantAnswers
          });
          if (typeof evidence === "string") throw new Error(evidence);
          transaction.set(accessRef, {
            id: accessRef.id, challengeId, userId, status: "approved", source: "owner_approval",
            requestId, grantedBy: user.uid, grantedAt: now, requirementAcknowledgements: evidence.requiredIds,
            participantAnswers: evidence.answers, requirementsAcceptedAt: requestData.requirementsAcceptedAt ?? now,
            createdAt: now, updatedAt: now
          }, { merge: true });
        }
        transaction.set(requestRef, { status: decision, decidedBy: user.uid, decidedAt: now, updatedAt: now }, { merge: true });
        return { requestId, status: decision, duplicate: false };
      });
      return ok(result, result.duplicate ? "This access decision is already recorded." : decision === "approved" ? "Access approved. The user must still complete challenge admission." : "Access request rejected.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (["OWNER_MISMATCH", "REQUEST_NOT_FOUND"].includes(code)) return fail("Private access request not found.", 404, undefined, code);
      if (code === "REQUEST_ALREADY_DECIDED") return conflict("This access request has already been decided.");
      if (code === "ACCESS_ALREADY_GRANTED") return conflict("This user already has a private access grant.");
      return serverError("Private access decision could not be saved.", code);
    }
  }

  return validationError({ action: "Choose a supported private access action." });
}
