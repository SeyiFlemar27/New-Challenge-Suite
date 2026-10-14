import { z } from "zod";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { normalMaterialChanges, proposeNormalMaterialChange } from "@/lib/server/normal-material-review";
import { fail, ok, readJson } from "@/lib/server/responses";
const schema = z.object({ changes: normalMaterialChanges, expectedUpdatedAt: z.string(), reason: z.string().trim().min(8).max(1000) }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.user || !access.db) return access.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body);
  if (!body.success) return fail("Select supported rules, instructions or deadline extensions and provide a reason. Financial commitments and classification cannot be overridden.", 422);
  try { return ok(await proposeNormalMaterialChange(access.db, id, access.user.uid, body.data.expectedUpdatedAt, body.data.changes, body.data.reason), "Change queued for Admin review; published values are unchanged."); }
  catch { return fail("The challenge changed or these proposed changes are not permitted. Refresh and review the current policies.", 409); }
}
