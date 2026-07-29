import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { settleApprovedPredictions } from "@/lib/server/prediction-settlement";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Prediction settlement");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const { id: challengeId } = await params;
  const proposalId = typeof parsed.body?.proposalId === "string" ? parsed.body.proposalId.trim() : "";
  if (!proposalId) return fail("An approved winner proposal is required.", 400, undefined, "WINNER_PROPOSAL_REQUIRED");
  const result = await settleApprovedPredictions(db, { challengeId, proposalId, adminId: user.uid });
  if (!result.settled) return fail(result.message ?? "Prediction settlement requires review.", 409, result, String(result.status).toUpperCase());
  return ok(result, result.message ?? "Prediction settlement recorded internally. No payout provider was called.");
}
