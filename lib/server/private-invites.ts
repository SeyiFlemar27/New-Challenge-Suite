import type { Firestore } from "firebase-admin/firestore";
import { createHash, randomBytes } from "node:crypto";
import { isPrivateChallengeRecord } from "@/lib/server/challenge-access";
import { isChallengeJoinable } from "@/lib/server/submission-lifecycle";
import { writeAuditLog } from "@/lib/server/audit";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export type PrivateAccessMethod = "invite_link" | "invitation_code" | "direct_invitations";

export function generateInviteCode(length = 8) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
}

export function generatePrivateInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPrivateInviteCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function hashPrivateInviteToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function inviteExpired(invite: Record<string, unknown>, now = Date.now()) {
  if (!invite.expiresAt) return false;
  const expiry = Date.parse(String(invite.expiresAt));
  return !Number.isFinite(expiry) || now >= expiry;
}

export async function hasPrivateChallengeAccess(db: Firestore, challengeId: string, userId: string) {
  const accessSnap = await db.collection("privateChallengeAccess").doc(`${challengeId}_${userId}`).get();
  return accessSnap.exists && accessSnap.data()?.status === "approved";
}

export function privateRequirements(challenge: Record<string, unknown>) {
  const strings = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  return {
    requirements: strings(challenge.privateParticipantRequirements),
    acknowledgements: strings(challenge.privateParticipantAcknowledgements),
    questions: strings(challenge.privateParticipantQuestions)
  };
}

export function validatePrivateParticipantEligibility(challenge: Record<string, unknown>, profile: Record<string, unknown>) {
  const status = String(profile.accountStatus ?? "active").toLowerCase();
  if (profile.disabled === true || profile.suspended === true || ["disabled", "suspended", "deactivated", "blocked", "deleted"].includes(status)) return "ACCOUNT_UNAVAILABLE";
  const countries = Array.isArray(challenge.eligibleCountries) ? challenge.eligibleCountries.map((value) => String(value).trim().toUpperCase()) : [];
  const country = String(profile.verifiedCountryCode ?? (profile.countryVerified === true ? profile.countryCode ?? profile.country : "") ?? "").trim().toUpperCase();
  if (countries.length && !country) return "COUNTRY_VERIFICATION_REQUIRED";
  if (countries.length && !countries.includes(country)) return "COUNTRY_NOT_ELIGIBLE";
  const minimumAge = Math.max(0, Math.trunc(Number(challenge.minimumAge ?? 0) || 0));
  if (minimumAge > 0) {
    const birthDate = profile.verifiedDateOfBirth ?? (profile.dateOfBirthVerified === true ? profile.dateOfBirth : null);
    const verifiedAge = profile.ageVerified === true ? Number(profile.verifiedAge ?? profile.age) : NaN;
    let age = Number.isFinite(verifiedAge) ? verifiedAge : NaN;
    if (!Number.isFinite(age) && birthDate) {
      const date = birthDate instanceof Date ? birthDate : typeof birthDate === "object" && birthDate !== null && "toDate" in birthDate && typeof birthDate.toDate === "function" ? birthDate.toDate() : new Date(String(birthDate));
      if (Number.isFinite(date.getTime())) {
        const today = new Date();
        age = today.getFullYear() - date.getFullYear() - (today < new Date(today.getFullYear(), date.getMonth(), date.getDate()) ? 1 : 0);
      }
    }
    if (!Number.isFinite(age)) return "AGE_VERIFICATION_REQUIRED";
    if (age < minimumAge) return "AGE_NOT_ELIGIBLE";
  }
  return null;
}

export function validatePrivateRequirementEvidence(challenge: Record<string, unknown>, body: Record<string, unknown>) {
  const configured = privateRequirements(challenge);
  const requiredIds = [
    ...configured.requirements.map((_, index) => `requirement-${index}`),
    ...configured.acknowledgements.map((_, index) => `acknowledgement-${index}`)
  ];
  const acknowledgements = Array.isArray(body.requirementAcknowledgements) ? body.requirementAcknowledgements.map(String) : [];
  if (requiredIds.some((id) => !acknowledgements.includes(id))) return "PARTICIPANT_REQUIREMENTS_REQUIRED";
  const answers = body.participantAnswers && typeof body.participantAnswers === "object" && !Array.isArray(body.participantAnswers)
    ? body.participantAnswers as Record<string, unknown>
    : {};
  if (configured.questions.some((_, index) => !String(answers[`question-${index}`] ?? "").trim())) return "PARTICIPANT_ANSWERS_REQUIRED";
  return { requiredIds, answers: Object.fromEntries(configured.questions.map((_, index) => [`question-${index}`, String(answers[`question-${index}`]).trim().slice(0, 1000)])) };
}

export async function createPrivateChallengeInvite(db: Firestore, input: {
  challengeId: string; creatorId: string; now: string; code?: string; expiresAt?: string | null;
  maxUses?: number | null; method?: PrivateAccessMethod; allowedEmails?: string[];
}) {
  const method = input.method ?? "invitation_code";
  const base = {
    challengeId: input.challengeId,
    creatorId: input.creatorId,
    accessMethod: method,
    status: "active",
    enabled: true,
    maxUses: input.maxUses ?? 100,
    currentUses: 0,
    expiresAt: input.expiresAt ?? null,
    createdAt: input.now,
    updatedAt: input.now,
    auditStatus: "created"
  };
  const credentials: Record<string, unknown> = {};

  if (method === "invitation_code") {
    let code = input.code && /^[A-HJ-NP-Z2-9]{5}$/.test(input.code) ? input.code.toUpperCase() : generateInviteCode(5);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const duplicate = await db.collection("privateChallengeInvites").where("codeHash", "==", hashPrivateInviteCode(code)).limit(1).get();
      if (duplicate.empty) break;
      code = generateInviteCode(5);
    }
    const ref = db.collection("privateChallengeInvites").doc();
    await ref.set({ ...base, id: ref.id, codeHash: hashPrivateInviteCode(code), codeLastTwo: code.slice(-2), joinApprovalRequired: false });
    credentials.code = code;
    credentials.inviteId = ref.id;
  } else if (method === "invite_link") {
    const token = generatePrivateInviteToken();
    const ref = db.collection("privateChallengeInvites").doc();
    await ref.set({ ...base, id: ref.id, tokenHash: hashPrivateInviteToken(token), tokenLastFour: token.slice(-4), joinApprovalRequired: false });
    credentials.token = token;
    credentials.inviteId = ref.id;
  } else {
    const emails = [...new Set((input.allowedEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (!emails.length || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("DIRECT_INVITEE_EMAILS_REQUIRED");
    const invitations: Array<{ email: string; token: string; invitationId: string }> = [];
    const batch = db.batch();
    for (const email of emails) {
      const token = generatePrivateInviteToken();
      const ref = db.collection("privateChallengeInvites").doc();
      batch.create(ref, { ...base, id: ref.id, recipientEmail: email, tokenHash: hashPrivateInviteToken(token), tokenLastFour: token.slice(-4), currentUses: 0, maxUses: 1, status: "pending", acceptedBy: null, acceptedAt: null, joinApprovalRequired: false });
      invitations.push({ email, token, invitationId: ref.id });
    }
    await batch.commit();
    credentials.invitations = invitations;
  }

  await writeAuditLog({
    actorId: input.creatorId,
    actorType: "user",
    action: "private_invite.created",
    targetType: "challenge",
    targetId: input.challengeId,
    after: { accessMethod: method, invitationCount: method === "direct_invitations" ? (credentials.invitations as unknown[]).length : 1 },
    reason: "Private challenge admission credential created.",
    metadata: { moneyMovementEnabled: false }
  }, db).catch(() => undefined);
  return { method, ...credentials };
}

export async function admitPrivateChallenge(db: Firestore, input: {
  challengeId: string; userId: string; verifiedEmail: string; method: PrivateAccessMethod;
  credential: string; requirementAcknowledgements: unknown; participantAnswers: unknown; now?: string;
}) {
  const token = input.credential.trim();
  const inviteQuery = input.method === "invitation_code"
    ? await db.collection("privateChallengeInvites").where("codeHash", "==", hashPrivateInviteCode(token)).limit(1).get()
    : await db.collection("privateChallengeInvites").where("tokenHash", "==", hashPrivateInviteToken(token)).limit(1).get();
  if (inviteQuery.empty) throw new Error("INVITE_NOT_FOUND");
  const inviteRef = inviteQuery.docs[0].ref;
  const inviteData = inviteQuery.docs[0].data();
  const challengeId = String(inviteData.challengeId ?? "");
  if (!challengeId || (input.challengeId && input.challengeId !== challengeId)) throw new Error("INVITE_CHALLENGE_MISMATCH");
  if (String(inviteData.accessMethod) !== input.method) throw new Error("ACCESS_METHOD_MISMATCH");
  const now = input.now ?? new Date().toISOString();
  const accessRef = db.collection("privateChallengeAccess").doc(`${challengeId}_${input.userId}`);
  const participantRef = db.collection("challengeParticipants").doc(`${challengeId}_${input.userId}`);
  return db.runTransaction(async (transaction) => {
    const [inviteSnap, challengeSnap, accessSnap, participantSnap, accountSnap, profileSnap] = await Promise.all([
      transaction.get(inviteRef),
      transaction.get(db.collection("challenges").doc(challengeId)),
      transaction.get(accessRef),
      transaction.get(participantRef),
      transaction.get(db.collection("users").doc(input.userId)),
      transaction.get(db.collection("profiles").doc(input.userId))
    ]);
    if (accessSnap.exists && accessSnap.data()?.status === "approved") return { challengeId, alreadyAdmitted: true, membershipStatus: participantSnap.data()?.status ?? "registered" };
    if (!challengeSnap.exists || !isPrivateChallengeRecord(challengeSnap.data() ?? {})) throw new Error("CHALLENGE_UNAVAILABLE");
    const challenge = { id: challengeId, ...challengeSnap.data() } as Record<string, unknown>;
    if (String(challenge.creatorId ?? challenge.hostId ?? "") === input.userId) throw new Error("SELF_ADMISSION_FORBIDDEN");
    const joinable = isChallengeJoinable(challenge);
    if (!joinable.allowed) throw new Error("CHALLENGE_NOT_JOINABLE");
    if (String(challenge.privateAccessMethod ?? "") !== input.method) throw new Error("ACCESS_METHOD_MISMATCH");
    const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
    const eligibilityError = validatePrivateParticipantEligibility(challenge, profile);
    if (eligibilityError) throw new Error(eligibilityError);
    const evidence = validatePrivateRequirementEvidence(challenge, {
      requirementAcknowledgements: input.requirementAcknowledgements,
      participantAnswers: input.participantAnswers
    });
    if (typeof evidence === "string") throw new Error(evidence);
    const currentParticipant = participantSnap.data() ?? {};
    const currentParticipantStatus = String(currentParticipant.status ?? "").toLowerCase();
    if (["rejected", "disqualified", "withdrawn", "removed"].includes(currentParticipantStatus)) throw new Error("PARTICIPATION_NOT_ELIGIBLE");
    if (!inviteSnap.exists) throw new Error("INVITE_INACTIVE");
    const invite = inviteSnap.data() ?? {};
    if (invite.enabled === false || !["active", "pending"].includes(String(invite.status)) || inviteExpired(invite)) throw new Error("INVITE_INACTIVE");
    if (input.method === "direct_invitations") {
      if (String(invite.recipientEmail ?? "").toLowerCase() !== input.verifiedEmail.trim().toLowerCase()) throw new Error("INVITE_RECIPIENT_MISMATCH");
      if (invite.status === "pending" && invite.acceptedBy) throw new Error("INVITE_ALREADY_CLAIMED");
    }
    const currentUses = Number(invite.currentUses ?? 0);
    const maxUses = Number(invite.maxUses ?? 0);
    if (maxUses > 0 && currentUses >= maxUses) throw new Error("INVITE_LIMIT_REACHED");
    const receipt = {
      id: accessRef.id,
      challengeId,
      userId: input.userId,
      inviteId: inviteRef.id,
      status: "approved",
      source: input.method,
      requirementAcknowledgements: evidence.requiredIds,
      participantAnswers: evidence.answers,
      requirementsAcceptedAt: now,
      membershipStatus: participantSnap.exists ? currentParticipant.status ?? "registered" : "registered",
      createdAt: now,
      updatedAt: now
    };
    const capacity = Math.max(0, Math.trunc(Number(challenge.maxParticipants ?? challenge.participantLimit ?? 0) || 0));
    const participantCount = Math.max(0, Math.trunc(Number(challenge.participantCount ?? 0) || 0));
    const waitlisted = !participantSnap.exists && capacity > 0 && participantCount >= capacity;
    if (waitlisted && challenge.waitlistEnabled !== true) throw new Error("CHALLENGE_FULL");
    if (!participantSnap.exists) {
      const membershipStatus = waitlisted ? "waitlisted" : "registered";
      transaction.create(participantRef, {
        id: participantRef.id,
        challengeId,
        userId: input.userId,
        status: membershipStatus,
        registeredAt: now,
        joinedAt: null,
        enteredAt: null,
        privateAccessMethod: input.method,
        privateInviteId: inviteRef.id,
        entryAgreementAccepted: false,
        paidEntryEnabled: false,
        entryFeeCents: 0,
        createdAt: now,
        updatedAt: now
      });
      transaction.set(db.collection("challenges").doc(challengeId), {
        registrationCount: Number(challenge.registrationCount ?? 0) + (waitlisted ? 0 : 1),
        ...(waitlisted ? { waitlistCount: Number(challenge.waitlistCount ?? 0) + 1 } : {}),
        updatedAt: now
      }, { merge: true });
    }
    transaction.create(accessRef, { ...receipt, membershipStatus: waitlisted ? "waitlisted" : receipt.membershipStatus });
    transaction.set(inviteRef, {
      currentUses: currentUses + 1,
      lastUsedAt: now,
      updatedAt: now,
      ...(input.method === "direct_invitations" ? { status: "accepted", acceptedBy: input.userId, acceptedAt: now } : {})
    }, { merge: true });
    transaction.create(db.collection("privateInviteAuditEvents").doc(), {
      challengeId, inviteId: inviteRef.id, userId: input.userId, action: `${input.method}_admitted`, createdAt: now
    });
    return { challengeId, alreadyAdmitted: false, membershipStatus: waitlisted ? "waitlisted" : receipt.membershipStatus };
  });
}

export async function revokePrivateChallengeInvite(db: Firestore, input: { challengeId: string; inviteId: string; actorId: string; now?: string }) {
  const inviteRef = db.collection("privateChallengeInvites").doc(input.inviteId);
  const challengeRef = db.collection("challenges").doc(input.challengeId);
  const now = input.now ?? new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const [inviteSnap, challengeSnap] = await Promise.all([transaction.get(inviteRef), transaction.get(challengeRef)]);
    if (!inviteSnap.exists || String(inviteSnap.data()?.challengeId) !== input.challengeId) throw new Error("INVITE_NOT_FOUND");
    if (!challengeSnap.exists || String(challengeSnap.data()?.creatorId ?? challengeSnap.data()?.hostId ?? "") !== input.actorId) throw new Error("PERMISSION_DENIED");
    transaction.set(inviteRef, { status: "revoked", enabled: false, revokedAt: now, revokedBy: input.actorId, updatedAt: now }, { merge: true });
  });
}
