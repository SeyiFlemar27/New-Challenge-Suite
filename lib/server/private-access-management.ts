import type { Firestore } from "firebase-admin/firestore";
import { getChallengeLifecycleState } from "@/lib/challenge-status";
import { privateEnrollmentOpen } from "@/lib/private-challenge-policy";
import { isPrivateChallengeRecord } from "@/lib/server/challenge-access";
import { preparePrivateCredential } from "@/lib/server/private-credentials";
import { setPrivateChallengeMediaAccessInTransaction, validatePrivateParticipantEligibility, validatePrivateRequirementEvidence } from "@/lib/server/private-invites";

const joinedStates = new Set(["registered", "entered", "enrolled", "approved", "active", "joined", "checked_in", "submitted", "winner"]);
export function privateParticipantJoined(participant: Record<string, unknown> = {}) { return joinedStates.has(String(participant.status)); }

/** Caller must first pass requireChallengeManagementAccess. The transaction rechecks the same challenge identity. */
export async function managePrivateAccess(db: Firestore, input: {
  challengeId: string; actorId: string; authorizedChallenge: Record<string, unknown>; action: string;
  requestId?: string; reason?: string; confirmed?: boolean; visible?: boolean; now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const challengeRef = db.collection("challenges").doc(input.challengeId);
  const auditRef = db.collection("privateInviteAuditEvents").doc();
  return db.runTransaction(async (transaction) => {
    const challengeSnap = await transaction.get(challengeRef);
    const challenge = { id: input.challengeId, ...challengeSnap.data() } as Record<string, unknown>;
    if (!challengeSnap.exists || !isPrivateChallengeRecord(challenge) || challenge.creatorId !== input.authorizedChallenge.creatorId || challenge.organizationOwnerId !== input.authorizedChallenge.organizationOwnerId) throw new Error("PERMISSION_DENIED");
    if (!input.confirmed || !input.reason?.trim()) throw new Error("CONFIRMATION_AND_REASON_REQUIRED");
    const reason = input.reason.trim().slice(0, 1000);
    if (input.action === "visibility") {
      if (getChallengeLifecycleState(challenge, new Date(now)).votingStatus === "voting_open") throw new Error("VISIBILITY_LOCKED_DURING_VOTING");
      const before = challenge.publicPreviewEnabled === true;
      transaction.set(challengeRef, { publicPreviewEnabled: input.visible === true, privateJoiningPolicy: input.visible === true ? "invite_and_request" : "invite_only", ...(input.visible !== true ? { privateVotingAccess: "access_restricted" } : {}), updatedAt: now }, { merge: true });
      transaction.create(auditRef, { challengeId: input.challengeId, actorId: input.actorId, action: "visibility_changed", before, after: input.visible === true, reason, createdAt: now });
      return { status: "updated" };
    }
    if (!privateEnrollmentOpen(challenge, new Date(now))) throw new Error("ENROLLMENT_CLOSED");
    if (input.action === "rotate") {
      if (challenge.privateAccessPolicyVersion !== 2) throw new Error("LEGACY_CREDENTIAL_REVIEW_REQUIRED");
      const credential = preparePrivateCredential(db, input.challengeId, String(challenge.creatorId ?? challenge.hostId), String(challenge.privateAccessMethod), now);
      if (challenge.privateCredentialId) transaction.set(db.collection("privateChallengeInvites").doc(String(challenge.privateCredentialId)), { status: "revoked", enabled: false, revokedBy: input.actorId, revokedAt: now, updatedAt: now }, { merge: true });
      credential.apply(transaction);
      transaction.set(challengeRef, { privateCredentialId: credential.inviteId, updatedAt: now }, { merge: true });
      transaction.create(auditRef, { challengeId: input.challengeId, actorId: input.actorId, action: "credential_rotated", beforeInviteId: challenge.privateCredentialId ?? null, afterInviteId: credential.inviteId, reason, createdAt: now });
      return { status: "rotated" };
    }
    if (!["approve", "reject", "revoke", "restore"].includes(input.action) || !input.requestId) throw new Error("INVALID_ACCESS_ACTION");
    const requestRef = db.collection("privateAccessRequests").doc(input.requestId);
    const requestSnap = await transaction.get(requestRef);
    const requestData = requestSnap.data() ?? {};
    const userId = String(requestData.userId ?? "");
    if (!requestSnap.exists || requestData.challengeId !== input.challengeId || requestRef.id !== `${input.challengeId}_${userId}`) throw new Error("REQUEST_NOT_FOUND");
    const accessRef = db.collection("privateChallengeAccess").doc(`${input.challengeId}_${userId}`);
    const [grant, participant, account, profile] = await Promise.all([
      transaction.get(accessRef), transaction.get(db.collection("challengeParticipants").doc(accessRef.id)),
      transaction.get(db.collection("users").doc(userId)), transaction.get(db.collection("profiles").doc(userId))
    ]);
    if (privateParticipantJoined(participant.data())) throw new Error("JOINED_PARTICIPANT_PROTECTED");
    const prior = String(requestData.status);
    const desired = input.action === "approve" || input.action === "restore" ? "approved" : input.action === "revoke" ? "revoked" : "rejected";
    if (prior === desired && grant.data()?.status === desired) return { status: desired, duplicate: true };
    if (input.action === "restore" ? !["rejected", "revoked"].includes(prior) : input.action === "revoke" ? prior !== "approved" : prior !== "pending_review") throw new Error("ACCESS_STATE_CHANGED");
    if (desired === "approved") {
      const error = validatePrivateParticipantEligibility(challenge, { ...profile.data(), ...account.data() });
      if (error) throw new Error(error);
      if (typeof validatePrivateRequirementEvidence(challenge, requestData) === "string") throw new Error("REQUIREMENTS_CHANGED");
    }
    transaction.set(requestRef, { status: desired, decidedBy: input.actorId, decidedAt: now, decisionReason: reason, updatedAt: now }, { merge: true });
    transaction.set(accessRef, { challengeId: input.challengeId, userId, requestId: requestRef.id, status: desired, source: "owner_approval", grantedBy: input.actorId, updatedAt: now, requirementAcknowledgements: requestData.requirementAcknowledgements ?? [], participantAnswers: requestData.participantAnswers ?? {}, requirementsAcceptedAt: requestData.requirementsAcceptedAt ?? now, ...(desired === "approved" ? { grantedAt: now } : { revokedAt: now }) }, { merge: true });
    setPrivateChallengeMediaAccessInTransaction(db, transaction, { challengeId: input.challengeId, userId, allowed: desired === "approved", now });
    transaction.create(auditRef, { challengeId: input.challengeId, requestId: requestRef.id, userId, actorId: input.actorId, action: `access_${input.action}`, before: { requestStatus: prior, accessStatus: grant.data()?.status ?? null }, after: desired, reason, createdAt: now });
    const notificationRef = db.collection("notifications").doc(`private_access_${auditRef.id}`);
    transaction.create(notificationRef, { id: notificationRef.id, userId, type: "private_access_decision", title: "Private challenge access updated", body: `Your access request is ${desired}. ${reason}`, status: "unread", read: false, targetId: input.challengeId, actionUrl: desired === "approved" ? `/challenges/${input.challengeId}` : "/private-exclusive", createdAt: now, updatedAt: now });
    return { status: desired, duplicate: false };
  });
}
