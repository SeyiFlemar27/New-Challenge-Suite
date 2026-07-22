import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { getAdminPrizeApprovalDetail } from "@/lib/server/prize-approvals";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin prize approval detail");
  const { proposalId } = await params;
  const detail = await getAdminPrizeApprovalDetail(db, proposalId);
  if (!detail) return fail("Prize approval proposal not found.", 404, undefined, "PRIZE_APPROVAL_NOT_FOUND");
  return ok(detail, "Prize approval detail loaded.");
}
