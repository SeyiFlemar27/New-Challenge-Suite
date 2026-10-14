import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { decideNormalMaterialChange } from "@/lib/server/normal-material-review";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
export async function GET(request: Request) {
  const access = await requireAdminPermission(request, "challenges.review"); if (access.response) return access.response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Material change review");
  const rows = await db.collection("normalMaterialChangeRequests").where("status", "==", "pending_review").limit(100).get();
  return ok({ requests: rows.docs.map(row => ({ id: row.id, ...row.data() })) });
}
const schema = z.object({ id: z.string().uuid(), decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(8).max(1000), confirmed: z.literal(true) }).strict();
export async function POST(request: Request) {
  const access = await requireRecentAdminAuthentication(request, "challenges.review"); if (access.response) return access.response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Material change review");
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body); if (!body.success) return fail("Confirmation and a decision reason are required.", 422);
  try { return ok(await decideNormalMaterialChange(db, body.data.id, access.user!.uid, body.data.decision, body.data.reason)); }
  catch { return fail("The request changed or is no longer eligible. No unauthorized change was applied.", 409); }
}
