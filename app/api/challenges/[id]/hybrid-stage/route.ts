import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { evaluateHybridStageTransition } from "@/lib/server/advanced-competitions";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Hybrid competition stage");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await params;
  const challengeRef = db.collection("challenges").doc(id);
  const [challengeSnap, submissionsSnap] = await Promise.all([
    challengeRef.get(),
    db.collection("submissions").where("challengeId", "==", id).limit(500).get()
  ]);
  if (!challengeSnap.exists) return fail("Hybrid competition not found.", 404, undefined, "NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const hostOperations = challenge.hostOperations && typeof challenge.hostOperations === "object" ? challenge.hostOperations as Record<string, unknown> : {};
  if (hostOperations.hybridCompetition !== true) return fail("This challenge is not a hybrid competition.", 409, undefined, "NOT_HYBRID_COMPETITION");
  const actorAuthorized = user.isAdmin || [challenge.creatorId, challenge.hostId, challenge.userId].includes(user.uid);
  const eligible = submissionsSnap.docs.filter((doc) => ["approved", "active"].includes(String(doc.data().status ?? "")));
  const finalists = eligible.filter((doc) => doc.data().hybridStage === "final_round" || doc.data().isFinalist === true);
  const finalResults = finalists.filter((doc) => doc.data().finalResultStatus === "confirmed");
  const transition = evaluateHybridStageTransition({
    currentStage: hostOperations.currentHybridStage ?? "online_qualification",
    nextStage: body.nextStage,
    eligibleSubmissionCount: eligible.length,
    finalistCount: finalists.length,
    finalResultCount: finalResults.length,
    winnersReviewed: hostOperations.winnersReviewed === true,
    actorAuthorized
  });
  if (!transition.allowed) return fail("Hybrid stage transition is not available.", 409, transition, transition.code);
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    transaction.set(challengeRef, { hostOperations: { ...hostOperations, currentHybridStage: transition.next, finalRoundOpen: transition.next === "final_round", updatedAt: now }, updatedAt: now }, { merge: true });
    transaction.set(db.collection("challengeAuditLogs").doc(`${id}_hybrid_${transition.next}_${Date.now()}`), { challengeId: id, actorId: user.uid, action: "hybrid_stage_transition", fromStage: transition.current, toStage: transition.next, createdAt: now });
  });
  return ok({ transition }, "Hybrid competition stage updated.");
}