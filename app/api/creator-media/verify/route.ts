import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/responses";
import { verifyCreatorImage } from "@/lib/server/creator-image-verification";
import { consumeRateLimit } from "@/lib/server/rate-limit";
export async function POST(request: Request) {
  const auth = await requireRequestUser(request);
  if (auth.response) return auth.response;
  if (!consumeRateLimit(`creator-image:${auth.user.uid}`, { limit: 30, windowMs: 60000 }).allowed) return fail("Too many verification attempts. Please retry shortly.", 429);
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  try { return ok(await verifyCreatorImage(String(parsed.body?.path ?? ""), auth.user.uid), "Stored image verified."); }
  catch (error) {
    const code = error instanceof Error ? error.message : "MEDIA_VERIFICATION_FAILED";
    return fail(code === "MEDIA_IMAGE_TOO_LARGE" ? "Image must be 10 MB or smaller." : code === "MEDIA_OWNERSHIP_INVALID" ? "This upload does not belong to your creator workspace." : "The stored image could not be verified. Use a valid JPEG, PNG, or WebP image and retry.", code === "MEDIA_OWNERSHIP_INVALID" ? 403 : 422, undefined, "MEDIA_VERIFICATION_FAILED");
  }
}
