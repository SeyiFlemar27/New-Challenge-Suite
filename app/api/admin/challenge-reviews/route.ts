import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { moderateChallengeException } from "@/lib/server/challenge-moderation";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireAdminPermission(request, "challenges.view"); if (auth.response) return auth.response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Challenge moderation");
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor && (cursor.includes("/") || cursor.length > 1500)) return fail("Invalid case cursor.", 422);
  let query = db.collection("challengeModerationCases").orderBy(FieldPath.documentId()).limit(51);
  if (cursor) query = query.startAfter(cursor);
  const snap = await query.get(), docs = snap.docs.slice(0, 50);
  return ok({ cases: docs.map(doc => ({ ...doc.data(), id: doc.id })), nextCursor: snap.size > 50 ? docs.at(-1)!.id : null }, "Exception moderation cases loaded.");
}
export async function PATCH(request: Request) {
  const auth = await requireAdminPermission(request, "challenges.review"); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = parsed.body ?? {}, caseId = String(body.caseId ?? ""), action = String(body.action ?? "");
  if (["approve", "reject", "request_changes"].includes(action)) return fail("Routine editorial approval has been retired. Use the exception moderation case workflow.", 410, undefined, "EDITORIAL_APPROVAL_RETIRED");
  if (!caseId || caseId.includes("/") || caseId.length > 1500 || !["hold", "remove", "release", "dismiss"].includes(action) || body.confirmed !== true || String(body.reason ?? "").trim().length < 8 || typeof body.expectedUpdatedAt !== "string") return fail("Select an existing case, confirm the action and give a reason of at least eight characters.", 422, undefined, "MODERATION_ACTION_INVALID");
  const db = getAdminDb(); if (!db) return serverUnavailable("Challenge moderation");
  try { return ok(await moderateChallengeException(db, { caseId, action: action as "hold" | "remove" | "release" | "dismiss", reason: String(body.reason).trim().slice(0, 1000), actorId: auth.user.uid, expectedUpdatedAt: body.expectedUpdatedAt }), "Moderation decision saved."); }
  catch (error) { return fail("The moderation decision could not be saved safely. Refresh the case and check the restriction or funding evidence.", 409, undefined, error instanceof Error ? error.message : "MODERATION_FAILED"); }
}
