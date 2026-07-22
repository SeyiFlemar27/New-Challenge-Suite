import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { finalizeApprovedWinnerProposalLedger } from "@/lib/server/prize-approvals";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Ledger finalization");
  const { id: challengeId, proposalId } = await params;
  const result = await finalizeApprovedWinnerProposalLedger(db, { challengeId, proposalId, adminId: user.uid });
  await writeAuditLog({
    actorId: user.uid,
    actorType: "admin",
    action: "ledger.finalization_attempted",
    targetType: "winner",
    targetId: proposalId,
    reason: result.message,
    metadata: {
      challengeId,
      status: result.status,
      ledgerEntriesCreated: result.ledgerEntriesCreated,
      payoutProviderCalled: false,
      paidOrWithdrawn: false
    }
  }, db);
  if (!result.finalized && !["already_finalized"].includes(String(result.status))) {
    return fail(result.message, result.status === "awaiting_confirmed_payments" ? 409 : 400, result, String(result.status).toUpperCase());
  }
  return ok(result, result.message);
}
