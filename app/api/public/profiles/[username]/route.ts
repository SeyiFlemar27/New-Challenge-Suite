import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { buildSocialProfile } from "@/lib/server/social-profile";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Public profile");
  try {
    const viewer = await getOptionalRequestUser(request);
    const result = await buildSocialProfile(db, username, viewer?.uid);
    if (!result || result.profile.profileVisibility === "private" && !result.profile.isOwner) {
      return fail("Public profile not found.", 404, undefined, "NOT_FOUND");
    }
    return ok(result, "Public profile loaded.");
  } catch (error) {
    return serverError("Public profile could not be loaded.", error instanceof Error ? error.message : error);
  }
}
