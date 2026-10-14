import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { queueNormalLifecycleRefunds } from "@/lib/server/normal-refunds";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Participant withdrawal");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!reason || body.confirmed !== true) return fail("Confirm withdrawal and provide a reason.", 422);
  const { id } = await params;
  try {
    const result = await db.runTransaction(async transaction => {
      const challenge = await transaction.get(db.collection("challenges").doc(id));
      const participant = await transaction.get(db.collection("challengeParticipants").doc(`${id}_${user.uid}`));
      if (!challenge.exists || challenge.data()?.normalLifecyclePolicyVersion !== 1 || !participant.exists || participant.data()?.userId !== user.uid) throw new Error("NOT_FOUND");
      const data = challenge.data() ?? {};
      const now = new Date();
      if (participant.data()?.status === "withdrawn") return { duplicate: true };
      if (data.effectiveVotingStartsAt && Date.parse(String(data.effectiveVotingStartsAt)) <= now.getTime()) throw new Error("POST_VOTING_WITHDRAWAL_REQUIRES_REVIEW");
      if (data.winnersApprovedAt || ["cancelled", "completed", "winners_announced"].includes(String(data.status)) || ["disqualified", "rejected"].includes(String(participant.data()?.status))) throw new Error("WITHDRAWAL_NOT_ELIGIBLE");
      transaction.update(participant.ref, { status: "withdrawn", withdrawnAt: now.toISOString(), withdrawalReason: reason, updatedAt: now.toISOString() });
      transaction.create(db.collection("auditLogs").doc(`normal_withdraw_${id}_${user.uid}`), { actorId: user.uid, action: "normal.participant_withdrawn", challengeId: id, targetId: participant.id, reason, before: { status: participant.data()?.status }, after: { status: "withdrawn" }, createdAt: now.toISOString() });
      return { duplicate: false };
    });
    await queueNormalLifecycleRefunds(db, id);
    return ok({ ...result, refundStatus: "awaiting_provider_confirmation" }, "Participation withdrawn. Any eligible entry refund is tracked until provider confirmation.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "WITHDRAWAL_FAILED";
    return fail(code === "POST_VOTING_WITHDRAWAL_REQUIRES_REVIEW" ? "Voting has started. Exceptional withdrawal requests require Support/Admin review." : "Participation could not be withdrawn in its current state.", code === "NOT_FOUND" ? 404 : 409, undefined, code);
  }
}
