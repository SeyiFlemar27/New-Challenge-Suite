import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

const actions = new Set(["view", "next", "previous", "view_details", "join", "vote", "follow", "share", "close"]);

export async function POST(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Story tracking");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const challengeId = typeof parsed.body?.challengeId === "string" ? parsed.body.challengeId : "";
  const action = typeof parsed.body?.action === "string" ? parsed.body.action : "";
  if (!challengeId || !actions.has(action)) return validationError({ story: "Valid challengeId and story action are required." });
  const viewer = await getOptionalRequestUser(request);
  const now = new Date().toISOString();
  const ref = db.collection("challengeStoryEvents").doc();
  await ref.set({
    id: ref.id,
    challengeId,
    viewerId: viewer?.uid ?? null,
    action,
    source: parsed.body?.source === "dashboard" ? "dashboard" : parsed.body?.source === "homepage" ? "homepage" : "explore",
    createdAt: now
  });
  return ok({ tracked: true }, "Story action recorded.");
}
