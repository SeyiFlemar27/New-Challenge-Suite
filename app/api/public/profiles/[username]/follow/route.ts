import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { findProfileByUsername } from "@/lib/server/social-profile";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile follows");
  const target = await findProfileByUsername(db, username);
  if (!target) return fail("Profile not found.", 404, undefined, "NOT_FOUND");
  if (target.id === user.uid) return fail("You cannot follow yourself.", 409, undefined, "SELF_FOLLOW_NOT_ALLOWED");
  const ref = db.collection("follows").doc(`${user.uid}_${target.id}`);
  const followerProfileRef = db.collection("profiles").doc(user.uid);
  const followingProfileRef = db.collection("profiles").doc(target.id);
  const now = new Date().toISOString();
  const result = await db.runTransaction(async (transaction) => {
    const [existing, followerProfile, followingProfile] = await Promise.all([
      transaction.get(ref),
      transaction.get(followerProfileRef),
      transaction.get(followingProfileRef)
    ]);
    if (existing.exists) {
      transaction.delete(ref);
      transaction.set(followerProfileRef, { following_count: Math.max(0, Number(followerProfile.data()?.following_count ?? 0) - 1), updatedAt: now }, { merge: true });
      transaction.set(followingProfileRef, { follower_count: Math.max(0, Number(followingProfile.data()?.follower_count ?? 0) - 1), updatedAt: now }, { merge: true });
      return { following: false };
    }
    transaction.create(ref, { id: ref.id, followerId: user.uid, followingId: target.id, status: "active", createdAt: now });
    transaction.set(followerProfileRef, { following_count: Number(followerProfile.data()?.following_count ?? 0) + 1, updatedAt: now }, { merge: true });
    transaction.set(followingProfileRef, { follower_count: Number(followingProfile.data()?.follower_count ?? 0) + 1, updatedAt: now }, { merge: true });
    return { following: true };
  });
  return ok(result, result.following ? "Following profile." : "Profile unfollowed.");
}
