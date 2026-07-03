import { getAdminDb } from "@/lib/firebase/admin";
import { findProfileByUsername } from "@/lib/server/social-profile";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { getOptionalRequestUser } from "@/lib/server/auth";

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile connections");
  const target = await findProfileByUsername(db, username);
  if (!target) return fail("Profile not found.", 404, undefined, "NOT_FOUND");
  const viewer = await getOptionalRequestUser(request);
  const privacy = target.data()?.privacySettings as Record<string, unknown> | undefined;
  if (privacy?.showFollowersFollowing === false && viewer?.uid !== target.id) {
    return fail("This connection list is private.", 403, undefined, "PERMISSION_DENIED");
  }
  const mode = new URL(request.url).searchParams.get("mode") === "following" ? "following" : "followers";
  const field = mode === "following" ? "followerId" : "followingId";
  const connectionField = mode === "following" ? "followingId" : "followerId";
  const snap = await db.collection("follows").where(field, "==", target.id).limit(500).get();
  const profiles = await Promise.all(snap.docs.map(async (doc) => {
    const userId = String(doc.data()[connectionField] ?? "");
    const profile = await db.collection("profiles").doc(userId).get();
    const data = profile.data() ?? {};
    return { id: userId, username: data.username ?? userId, displayName: data.displayName ?? "Challenge Suite Member", avatarUrl: data.avatarUrl ?? null };
  }));
  return ok({ mode, profiles }, "Profile connections loaded.");
}
