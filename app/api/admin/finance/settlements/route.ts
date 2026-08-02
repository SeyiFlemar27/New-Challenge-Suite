import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

function records(snapshot: FirebaseFirestore.QuerySnapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }));
}

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "finance.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Settlement finance review");

  const [settlementSnap, cashLedgerSnap, platformLedgerSnap] = await Promise.all([
    db.collection("challengeSettlements").limit(100).get(),
    db.collection("cashLedger").limit(300).get(),
    db.collection("platformLedger").limit(200).get()
  ]);
  const settlements = records(settlementSnap)
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
  const settlementIds = new Set(settlements.map((settlement) => settlement.id));
  const walletCredits = records(cashLedgerSnap).filter((item) => settlementIds.has(String(item.settlementId ?? "")));
  const platformLedger = records(platformLedgerSnap).filter((item) => settlementIds.has(String(item.settlementId ?? "")));

  return ok({
    settlements,
    walletCredits,
    platformLedger,
    providerPayoutExecutionEnabled: false,
    automaticRefundExecutionEnabled: false
  }, "Settlement finance review loaded.");
}
