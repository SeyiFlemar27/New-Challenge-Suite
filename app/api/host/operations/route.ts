import { getAdminDb } from "@/lib/firebase/admin";
import { getEffectiveTier } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

type Item = Record<string, unknown> & { id: string };
function serialize(document: FirebaseFirestore.QueryDocumentSnapshot): Item { return { id: document.id, ...document.data() }; }
function ownerId(item: Record<string, unknown>) { return String(item.creatorId ?? item.hostId ?? item.ownerId ?? ""); }
function unique(items: Item[]) { return [...new Map(items.map((item) => [item.id, item])).values()]; }

async function ownedChallenges(db: FirebaseFirestore.Firestore, userId: string, admin: boolean) {
  if (admin) return (await db.collection("challenges").limit(200).get()).docs.map(serialize);
  const [creator, host] = await Promise.all([
    db.collection("challenges").where("creatorId", "==", userId).limit(150).get(),
    db.collection("challenges").where("hostId", "==", userId).limit(150).get().catch(() => null)
  ]);
  return unique([...creator.docs.map(serialize), ...(host?.docs.map(serialize) ?? [])]).filter((item) => ownerId(item) === userId);
}

async function related(db: FirebaseFirestore.Firestore, collection: string, ids: string[]) {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30));
  const snapshots = await Promise.all(chunks.map((chunk) => db.collection(collection).where("challengeId", "in", chunk).limit(500).get().catch(() => null)));
  return snapshots.flatMap((snapshot) => snapshot?.docs.map(serialize) ?? []);
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Host operations");
  const [account, profile] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("profiles").doc(user.uid).get()]);
  const planProfile = { ...(profile.data() ?? {}), ...(account.data() ?? {}) };
  const tier = getEffectiveTier(planProfile).id;
  if (!user.isAdmin && !["host", "creator"].includes(tier)) return fail("Host tools are available to Creator and Host accounts.", 403, undefined, "HOST_PLAN_REQUIRED");

  const challenges = await ownedChallenges(db, user.uid, Boolean(user.isAdmin));
  const challengeIds = challenges.map((item) => item.id);
  const [challengeParticipants, legacyParticipants, submissions, winners, votes, attendance, sponsorInterest, boosts, notifications] = await Promise.all([
    related(db, "challengeParticipants", challengeIds),
    related(db, "participants", challengeIds),
    related(db, "submissions", challengeIds),
    related(db, "winners", challengeIds),
    related(db, "votes", challengeIds),
    related(db, "liveEventRegistrations", challengeIds),
    related(db, "sponsorProposals", challengeIds),
    related(db, "challengeBoosts", challengeIds),
    db.collection("notifications").where("userId", "==", user.uid).limit(50).get().then((snap) => snap.docs.map(serialize)).catch(() => [])
  ]);
  const participants = unique([...challengeParticipants, ...legacyParticipants]);
  const completedStatuses = new Set(["completed", "winners_announced", "settled", "closed"]);
  const completedChallenges = challenges.filter((item) => completedStatuses.has(String(item.status ?? item.lifecycleStatus ?? "").toLowerCase()));
  return ok({
    challenges,
    completedChallenges,
    participants,
    submissions,
    boosts,
    winners,
    votes,
    attendance,
    sponsorInterest,
    notifications,
    controls: { moderationMutationsEnabled: true, exportsEnabled: true, financialExecutionEnabled: false }
  }, "Host operations loaded.");
}
