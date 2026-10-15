import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { fail, ok, readJson } from "@/lib/server/responses";
import { privateEnrollmentOpen } from "@/lib/private-challenge-policy";
import { isPrivateChallengeRecord } from "@/lib/server/challenge-access";
import { readPrivateCredential, privateCredentialServiceReady } from "@/lib/server/private-credentials";
import { managePrivateAccess, privateParticipantJoined } from "@/lib/server/private-access-management";
export const dynamic = "force-dynamic";

async function getAccess(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.db || !access.challenge) return access.response;
  if (!isPrivateChallengeRecord(access.challenge)) return fail("Private challenge not found.", 404);
  const db = access.db;
  if (new URL(request.url).searchParams.get("credentialStatus") === "true") {
    const vault = await db.collection("privateCredentialVault").doc(id).get();
    const data = vault.data();
    const invite = data?.inviteId ? await db.collection("privateChallengeInvites").doc(String(data.inviteId)).get() : null;
    const prepared = privateCredentialServiceReady() && access.challenge.privateAccessPolicyVersion === 2 && !!data?.ciphertext && !!data?.iv && !!data?.tag
      && data?.inviteId === access.challenge.privateCredentialId && data?.method === access.challenge.privateAccessMethod
      && invite?.data()?.challengeId === id && invite?.data()?.enabled === true;
    return ok({ prepared, method: String(access.challenge.privateAccessMethod ?? ""), sharingAvailable: prepared && privateEnrollmentOpen(access.challenge) }, "Invitation preparation status loaded.");
  }
  if (new URL(request.url).searchParams.get("share") === "true") {
    if (!privateEnrollmentOpen(access.challenge)) return fail("Sharing is available only after publication while registration is open.", 409);
    try { const result = ok(await readPrivateCredential(db, id), "Share this credential securely."); result.headers.set("Cache-Control", "no-store, private"); return result; }
    catch { return fail("Secure sharing is unavailable for this credential. Historical invitations remain unchanged.", 503); }
  }
  const url = new URL(request.url);
  const requestCursor = url.searchParams.get("requestCursor") ?? "";
  const participantCursor = url.searchParams.get("participantCursor") ?? "";
  if ([requestCursor, participantCursor].some((cursor) => cursor.length > 300 || cursor.includes("/"))) return fail("Invalid management cursor.", 400);
  let requestsQuery = db.collection("privateAccessRequests").where("challengeId", "==", id).orderBy("__name__").limit(51);
  let participantsQuery = db.collection("challengeParticipants").where("challengeId", "==", id).orderBy("__name__").limit(51);
  if (requestCursor) requestsQuery = requestsQuery.startAfter(requestCursor);
  if (participantCursor) participantsQuery = participantsQuery.startAfter(participantCursor);
  const [requests, participants] = await Promise.all([requestsQuery.get(), participantsQuery.get()]);
  const requestDocs = requests.docs.slice(0, 50), participantDocs = participants.docs.slice(0, 50);
  const relatedParticipants = requestDocs.length ? await db.getAll(...requestDocs.map((doc) => db.collection("challengeParticipants").doc(`${id}_${doc.data().userId}`))) : [];
  const joined = new Set(relatedParticipants.filter((doc) => privateParticipantJoined(doc.data())).map((doc) => String(doc.data()?.userId)));
  return ok({ enrollmentOpen: privateEnrollmentOpen(access.challenge), invitationMethod: String(access.challenge.privateAccessMethod ?? ""), publicPreviewEnabled: access.challenge.publicPreviewEnabled === true,
    requests: requestDocs.map((doc) => ({ id: doc.id, userId: doc.data().userId, reason: doc.data().reason ?? "", status: doc.data().status, decisionReason: doc.data().decisionReason ?? "", joined: joined.has(String(doc.data().userId)) })),
    participants: participantDocs.filter((doc) => privateParticipantJoined(doc.data())).map((doc) => ({ id: doc.id, userId: doc.data().userId, status: doc.data().status })),
    nextRequestCursor: requests.size > 50 ? requestDocs.at(-1)?.id : null, nextParticipantCursor: participants.size > 50 ? participantDocs.at(-1)?.id : null }, "Access management loaded.");
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await getAccess(request, context);
  response?.headers.set("Cache-Control", "no-store, private");
  return response;
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.db || !access.user || !access.challenge) return access.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  try {
    return ok(await managePrivateAccess(access.db, { challengeId: id, actorId: access.user.uid, authorizedChallenge: access.challenge, action: String(body.action), requestId: typeof body.requestId === "string" ? body.requestId : undefined, reason: String(body.reason ?? ""), confirmed: body.confirmed === true, visible: body.visible === true }), "Access settings updated.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "PRIVATE_ACCESS_FAILED";
    const known = ["PERMISSION_DENIED", "CONFIRMATION_AND_REASON_REQUIRED", "VISIBILITY_LOCKED_DURING_VOTING", "ENROLLMENT_CLOSED", "LEGACY_CREDENTIAL_REVIEW_REQUIRED", "INVALID_ACCESS_ACTION", "REQUEST_NOT_FOUND", "JOINED_PARTICIPANT_PROTECTED", "ACCESS_STATE_CHANGED", "REQUIREMENTS_CHANGED"];
    return fail(known.includes(code) ? code.toLowerCase().replaceAll("_", " ") : "Access change could not be completed. No success has been confirmed.", known.includes(code) ? 409 : 503, undefined, known.includes(code) ? code : "PRIVATE_ACCESS_UNAVAILABLE");
  }
}
