import { getAdminDb } from "@/lib/firebase/admin";
import { getEffectiveTier } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function serialize(document: FirebaseFirestore.QueryDocumentSnapshot) {
  return { id: document.id, ...document.data() };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Host operations");

  const [account, profile] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get()
  ]);
  const planProfile = { ...(profile.data() ?? {}), ...(account.data() ?? {}) };
  if (getEffectiveTier(planProfile).id !== "host") {
    return fail("Host tools are available on the Host Plan.", 403, undefined, "HOST_PLAN_REQUIRED");
  }

  const challengeSnap = await db.collection("challenges").where("creatorId", "==", user.uid).limit(100).get();
  const challenges = challengeSnap.docs.map(serialize);
  const challengeIds = new Set(challenges.map((item) => String(item.id)));
  const [participantSnap, submissionSnap, winnerSnap, notificationSnap] = await Promise.all([
    db.collection("participants").where("userId", "==", user.uid).limit(200).get().catch(() => null),
    db.collection("submissions").where("creatorId", "==", user.uid).limit(200).get().catch(() => null),
    db.collection("winners").where("creatorId", "==", user.uid).limit(100).get().catch(() => null),
    db.collection("notifications").where("userId", "==", user.uid).limit(50).get().catch(() => null)
  ]);
  const belongsToHostedChallenge = (item: Record<string, unknown>) => challengeIds.has(String(item.challengeId ?? ""));
  const participants = participantSnap?.docs.map(serialize).filter(belongsToHostedChallenge) ?? [];
  const submissions = submissionSnap?.docs.map(serialize).filter(belongsToHostedChallenge) ?? [];
  const winners = winnerSnap?.docs.map(serialize).filter(belongsToHostedChallenge) ?? [];
  const notifications = notificationSnap?.docs.map(serialize) ?? [];

  return ok({
    challenges,
    participants,
    submissions,
    winners,
    notifications,
    controls: {
      moderationMutationsEnabled: false,
      votingStateMutationsEnabled: false,
      winnerPublishingEnabled: false,
      exportsEnabled: false,
      financialExecutionEnabled: false
    }
  }, "Host operations loaded.");
}
