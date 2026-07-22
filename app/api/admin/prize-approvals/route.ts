import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { serializeProposal } from "@/lib/server/prize-approvals";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request) {
  const { response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin prize approvals");

  const snap = await db.collection("winnerProposals").where("status", "==", "pending_admin_review").limit(100).get();
  const proposals = snap.docs.map(serializeProposal).sort((a, b) => String(b.submittedAt ?? b.createdAt ?? "").localeCompare(String(a.submittedAt ?? a.createdAt ?? "")));
  return ok({
    proposals,
    moneyMovementEnabled: false,
    payoutProviderCalled: false,
    emptyState: proposals.length === 0 ? "No prize approvals pending." : null
  }, "Prize approval queue loaded.");
}
