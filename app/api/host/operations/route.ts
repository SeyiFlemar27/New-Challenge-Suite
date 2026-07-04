import { getAdminDb } from "@/lib/firebase/admin";
import { getEffectiveTier } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function serialize(document: FirebaseFirestore.QueryDocumentSnapshot) {
  return { id: document.id, ...document.data() };
}

async function readHostedRecords(db: FirebaseFirestore.Firestore, collection: string, challengeIds: string[]) {
  if (!challengeIds.length) return [];
  const batches: string[][] = [];
  for (let index = 0; index < challengeIds.length; index += 30) batches.push(challengeIds.slice(index, index + 30));
  const snapshots = await Promise.all(batches.map((ids) =>
    db.collection(collection).where("challengeId", "in", ids).limit(300).get()
  ));
  return snapshots.flatMap((snapshot) => snapshot.docs.map(serialize));
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
  const challengeIds = challenges.map((item) => String(item.id));
  const [participants, submissions, winners, notificationSnap] = await Promise.all([
    readHostedRecords(db, "participants", challengeIds),
    readHostedRecords(db, "submissions", challengeIds),
    readHostedRecords(db, "winners", challengeIds),
    db.collection("notifications").where("userId", "==", user.uid).limit(50).get().catch(() => null)
  ]);
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
